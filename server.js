require("dotenv").config()
const express = require("express")
const app = express()
const { Client } = require('@notionhq/client')
const notion = new Client({ auth: process.env.NOTION_API_KEY })


// DB info - test workspace
const databases = {
    "FD": "27540a8e-51bc-8154-9a98-000b9f7c2d41",
    "Trainings": "27540a8e-51bc-810f-b03a-000ba1403500",
    "Tasks": "27540a8e-51bc-81e5-bcdf-000bd503f4da",
    "Teams": "27540a8e-51bc-811c-a57a-000b33cc188f"
}

// DB info - real
// const databases = {}

const getDB = async (sourceID, {filters = undefined, sort = undefined, count = undefined} = {}) => {

  return await notion.dataSources.query({
    data_source_id: sourceID,
    ...(filters && {filter: filters}),
    ...(sort && {sorts: sort}),
    // filter: {
    // //   or: [
    // //     {
    // //       property: 'In stock',
    // //       checkbox: {
    // //         equals: true,
    // //       },
    // //     },
    // //     {
    // //       property: 'Cost of next trip',
    // //       number: {
    // //         greater_than_or_equal_to: 2,
    // //       },
    // //     },
    // //   ],
    //   and: [
    //     {
    //         property: 
    //     }
    //   ]
    // },
    // sorts: [
    //   {
    //     property: 'Last ordered',
    //     direction: 'ascending',
    //   },
    // ],
    ...(count && {page_size: count})
  })

}

const getPage = async (pageID) => {
    const res = await notion.pages.retrieve({
        page_id: pageID
    })

    return res
}

const createPage = async (pageInfo) => {
    const res = await notion.pages.create(pageInfo)

    console.log(res)

    return res
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

const getTeam = async (teamName) => {

    const teamFilter = {
        "property": "Name",
        "title": {
            "equals": teamName
        }
    }

    const res = await getDB(databases.Teams, {filters: teamFilter, count: 1})

    return res.results[0]["id"]

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

const setTasks = async (personFD, tasks) => {
    console.log("running setTasks: " + personFD)

    const allRes = []

    for (const task of tasks) {
        console.log("attempting to create task: " + task["title"])

        // create new page in tasks db - with title, icon, and personFD of task
        const personRes = await getPage(personFD)
        const person = personRes["properties"]["Notion Account*"]["people"][0]["id"]

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
        
        console.log(res)

        // remove this after testing!!!!!!!!!!!!!
        return res

        allRes.push(res)
    }

    return allRes
}

const assignTasks = async (personFD) => {
    
    const team = await getTeam("Technology")
    const trainingsRes = await getTrainings(team)
    const trainings = trainingsRes.filter((train, i) => trainingsRes.indexOf(train) === i)

    const tasks = (await Promise.all(trainings.map(async train => await getTasks(train)))).filter(task => Object.keys(task).length > 0)

    console.log(tasks)

    const res = await setTasks(personFD, tasks)

    return res

}

app.get("/", async (req, resp) => {

    const personFD = "27540a8e-51bc-81a5-948d-c9139d2fa2f3"

    const res = assignTasks(personFD)

    resp.json(res)

})

app.listen(3000)