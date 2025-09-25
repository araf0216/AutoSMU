require("dotenv").config()
const express = require("express")
const app = express()
const { Client } = require('@notionhq/client')
const notion = new Client({ auth: process.env.NOTION_API_KEY })

app.use(express.json())

// DB info - test workspace
// const databases = {
//     "FD": "27540a8e-51bc-8154-9a98-000b9f7c2d41",
//     "Trainings": "27540a8e-51bc-810f-b03a-000ba1403500",
//     "Tasks": "27540a8e-51bc-81e5-bcdf-000bd503f4da",
//     "Teams": "27540a8e-51bc-811c-a57a-000b33cc188f"
// }

// DB info - real
const databases = {
    "FD": "279fc07e-9b9c-8197-b62f-000b658ece81",
    "Trainings": "279fc07e-9b9c-81dc-b32a-000bb6aba4ca",
    "Tasks": "279fc07e-9b9c-81be-af6a-000b5b4a8ff1",
    "Teams": "279fc07e-9b9c-8170-9316-000beff06980"
}

const getDB = async (sourceID, {filters = undefined, sort = undefined, count = undefined} = {}) => {

  return await notion.dataSources.query({
    data_source_id: sourceID,
    ...(filters && {filter: filters}),
    ...(sort && {sorts: sort}),
    ...(count && {page_size: count})
  })

}

const getPage = async (pageID) => {
    const res = await notion.pages.retrieve({
        page_id: pageID
    })

    return res
}

const updatePage = async (pageID, props) => {
    const res = await notion.pages.update({
        page_id: pageID,
        properties: props
    })

    return res
}

const createPage = async (pageInfo) => {
    const res = await notion.pages.create(pageInfo)

    // console.log(res)

    return res
}

const deletePage = async (pageID) => {
    await notion.pages.update({
        page_id: pageID,
        in_trash: true
    })
}

const getPerson = async (name) => {

    const personFilter = {
        "property": "Name",
        "title": {
            "equals": name
        }
    }

    const res = await getDB(databases.FD, {filters: personFilter, count: 1})

    return res.results[0]

}

const getStarters = async () => {
    // const allStarts = []

    const startsFilter = {
        "and": [
            {
                "property": "FT Start Date",
                "date": {
                    // "equals": new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
                    "equals": new Date().toISOString().split("T")[0]
                }
            },
            {
                "property": "Teams",
                "relation": {
                    "is_not_empty": true
                }
            },
            {
                "property": "Tasks SMU",
                "relation": {
                    "is_not_empty": true
                }
            }
            // {
            //     "property": "SMU Enrollment",
            //     "status": {
            //         "equals": "Not Enrolled"
            //     }
            // }
        ]
    }

    const res = await getDB(databases.FD, {filters: startsFilter})

    console.log(JSON.stringify(res, null, 4))

    return res.results
}

// const getTeam = async (personFD) => {

//     const teamFilter = {
//         "property": "Name",
//         "title": {
//             "equals": teamName
//         }
//     }

//     const res = await getDB(databases.Teams, {filters: teamFilter, count: 1})

// }

const getTeams = async (personFD) => {

    const res = await getPage(personFD)

    return res["properties"]["Teams"]["relation"].map(team => team["id"])

}

const getTrainings = async (team) => {

    const trainFilter = {
        "property": "Teams",
        "relation": {
            "contains": team
        }
    }

    const res = await getDB(databases.Trainings, {filters: trainFilter})

    // console.log(res.results.map(train => {
    //     return {
    //         [train["id"]]: train["properties"]["Training Name"]["title"][0]["text"]["content"]
    //     }
    // }))

    return res.results.map(train => train["id"])

}

// const getSubTasks = async () => {}

const getTasks = async (training) => {
    // console.log("running getTasks: " + training)

    const taskFilter = {
        "and": [
            {
                "property": "Training Courses ",
                "relation": {
                    "contains": training
                }
            },
            {
                "property": "Parent item",
                "relation": {
                    "is_empty": true
                }
            }
        ]
    }

    const taskSort = [
        {
            "timestamp": "created_time",
            "direction": "descending"
        }
    ]

    const res = await getDB(databases.Tasks, {filters: taskFilter, sort: taskSort, count: 1})

    // TODO - grab all levels of possible child tasks in task tree (in order of bfs)

    // console.log(res.results)

    if (res.results.length === 0) {
        return {}
    }

    const task = res.results[0]

    return {
        "id": task["id"],
        "title": task["properties"]["Name"]["title"][0]["text"]["content"],
        "icon": task["icon"],
        "training": training
    }
}

// const setTrainings = async (person, trainings) => {}

const setTasks = async (person, personFD, tasks) => {
    // console.log("running setTasks: " + personFD)

    const allRes = []

    for (const task of tasks) {
        console.log("creating task: " + task["title"])

        // create new page in tasks db - with title, icon, and personFD of task

        const info = {
            "parent": {
                "type": "data_source_id",
                "data_source_id": databases.Tasks
            },
            "icon": task["icon"],
            "properties": {
                "Name": {
                    "title": [
                        {
                            "text": {
                                "content": task["title"]
                            }
                        },
                        {
                            "mention": {
                                "user": {
                                    "id": person
                                }
                            }
                        }
                    ]
                },
                "Training Courses ": {
                    "relation": [
                        {
                            "id": task["training"]
                        }
                    ]
                },
                "Firm Directory": {
                    "relation": [
                        {
                            "id": personFD
                        }
                    ]
                },
                "Assignment": {
                    "people": [
                        {
                            "object": "user",
                            "id": person
                        }
                    ]
                }
            }
        }

        const res = await createPage(info)
        
        // console.log(res)

        allRes.push(res)
    }

    return allRes
}

const assignTasks = async (person, personFD) => {
    
    const teams = await getTeams(personFD)
    const trainingsRes = (await Promise.all(teams.map(async team => await getTrainings(team)))).flat()
    const trainings = trainingsRes.filter((train, i) => trainingsRes.indexOf(train) === i)

    const tasks = (await Promise.all(trainings.map(async train => await getTasks(train)))).filter(task => Object.keys(task).length > 0)

    // console.log(tasks)

    const setRes = await setTasks(person, personFD, tasks)

    const props = {
        "SMU ": {
            "status": {
                "name": "✅ Enrolled"
            }
        }
    }

    const res = await updatePage(personFD, props)

    return res

}

const deleteTasks = async (person) => {
    const personFilter = {
        "property": "Assignment",
        "people": {
            "contains": person
        }
    }

    const res = await getDB(databases.Tasks, {filters: personFilter})

    await Promise.all(res.results.map(async page => await deletePage(page["id"])))

    return
}

app.get("/", async (req, resp) => {

    return resp.json({"test": "get"})

    // const res = await getDB(databases.FD)

    // return resp.json(res)

})

app.post("/", async (req, res) => {
    console.log("printing req")

    console.log(JSON.stringify(req.headers, null, 4))
    console.log(JSON.stringify(req.body, null, 4))

    const indicator = "request_source"
    const indicatorValue = "daily-mountain-hook-check"

    if (req.headers.hasOwnProperty(indicator) && req.headers[indicator] === indicatorValue) {
        const starters = await getStarters()

        console.log(starters.length)
        const startersCount = starters.length
        // const startersCount = 0

        if (startersCount === 0) {
            const msJ = {"periodic request skipped": "none matched criteria"}
            console.log(msJ)
            return res.json(msJ)
        }

        await Promise.all(starters.map(async starter => await assignTasks(starter["properties"]["Notion Account*"]["people"][0]["id"], starter["id"])))

        const msJ = {"periodic request completed": startersCount + " assigned"}
        console.log(msJ)
        return res.json(msJ)
    }

    if (!req.body.hasOwnProperty("entity") || !req.body.hasOwnProperty("data") || !req.body.data.hasOwnProperty("parent")) {
        const msJ = {"request invalid": "invalid request"}
        console.log(msJ)
        return res.json(msJ)
    }

    const page = req.body.entity
    const parentDB = req.body.data.parent.data_source_id

    if (parentDB !== databases.FD) {
        const msJ = {"request ignored": "unrelated DB changes"}
        console.log(msJ)
        return res.json(msJ)
    }

    const personFD = page.id
    const personInfo = await getPage(personFD)
    const personTeams = personInfo["properties"]["Teams"]["relation"]

    if (personTeams.length === 0) {
        const msJ = {"request ignored": "no teams"}
        console.log(msJ)
        return res.json(msJ)
    }

    const person = personInfo["properties"]["Notion Account*"]["people"][0]["id"]

    const personStart = personInfo["properties"]["FT Start Date"]["date"]["start"]
    const startsToday = personStart === new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })

    const personEnrolled = personInfo["properties"]["SMU "]["status"]?.["name"]

    const personTasks = personInfo["properties"]["Tasks SMU"]["relation"]

    console.log(personTasks.length + " tasks of person updated")

    if ((startsToday && personEnrolled === "🔴 To Be Enrolled" && personTasks.length === 0) || personEnrolled === "🔄 Reset Enrollment") {

        console.log("triggering task assignment to " + personFD + " within " + parentDB)

        if (personEnrolled === "Reset Enrollment") await deleteTasks(person)

        await assignTasks(person, personFD)

        const msJ = {"request accepted": "tasks assigned to " + personFD + " within " + parentDB}
        console.log(msJ)
        return res.json(msJ)

    }

    const msJ = {"request denied": "unmet individual conditions"}
    console.log(msJ)
    return res.json(msJ)
    
})


app.listen(3000)