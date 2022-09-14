#!/usr/bin/env python3

# This example scrapes the issue list and issue events of the GitHub projects and saves them to MongoDB

from typing import List, Dict
import pymongo
from github_scraper import GithubScraperClient

# TODO: Modify the following line to connect to your MongoDB
MONGO_URL = "mongodb://localhost:27017/"
MONGO_DB = "github"

# TODO: Modify the following line if you want to use a proxy
PROXY_URL = None  # or a http proxy url like "http://127.0.0.1:10080"

def get_project_list() -> List[Dict[str, str]]:
    """TODO: Modify this function to return a list of projects to scrape"""
    project_list = [
        {
            "owner": "pandas-dev",
            "name": "pandas",
        },
        {
            "owner": "facebook",
            "name": "react",
            "query": "is:issue is:open",
        }
    ]
    return project_list

def get_issue_list() -> list:
    """TODO: Modify this function to return a list of issues to scrape ([{name: xx, owner: xx, id: xx}, ...])"""
    return list(db.issues.find({}, {"owner": 1, "name": 1, "id": 1, "_id": 0}))

# scrape brief issue info (id, title, actedAt, state, checks) and save to mongodb
def list_callback(results: list, params: dict) -> None:
    if not results:
        return
    for result in results:
        db.issues.replace_one(
            {
                "owner": params["owner"],
                "name": params["name"],
                "id": result["id"],
            },
            {
                **result,
                "owner": params["owner"],
                "name": params["name"],
            },
            upsert=True,
            )

# scrape issue events (create, close, comment, reference, etc.) and save to mongodb
def body_callback(results: list, params: dict) -> None:
    if not results:
        return
    for result in results:
        db.issue_body.replace_one(
            {
                "owner": params["owner"],
                "name": params["name"],
                "id": params["id"],
                "itemId": result["itemId"],
            },
            {
                **result,
                "owner": params["owner"],
                "name": params["name"],
                "id": params["id"],
            },
            upsert=True,
        )

if __name__ == "__main__":
    client = pymongo.MongoClient(MONGO_URL)
    db = getattr(client, MONGO_DB)
    
    scraper = GithubScraperClient(
        baseurl="https://scraper.12f23eddde.workers.dev/github", auth="OSSLab@PKU", num_workers=5, proxy=PROXY_URL
    )

    project_list = get_project_list()
    print(f"Total projects: {len(project_list)}, first 5: {project_list[:5]}")
    # create index
    db.issues.create_index([("owner", pymongo.ASCENDING), ("name", pymongo.ASCENDING), ("id", pymongo.ASCENDING)], unique=True)
    # run query
    scraper.get_pull_lists_with_callback(project_list, list_callback)

    ### issue body emits less subrequests, so we can scrape more issues in one run
    scraper = GithubScraperClient(
        baseurl="https://scraper.12f23eddde.workers.dev/github", auth="OSSLab@PKU", num_workers=25, proxy=PROXY_URL
    )

    list_issues = get_issue_list()
    print(f"Total issues: {len(list_issues)}, first 5: {list_issues[:5]}")
    # create index
    db.issue_body.create_index([("owner", pymongo.ASCENDING), ("name", pymongo.ASCENDING), ("id", pymongo.ASCENDING), ("itemId", pymongo.ASCENDING)], unique=True)
    # run query
    scraper.get_issues_with_callback(list_issues, body_callback)
