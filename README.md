# 使用CloudFlare Workers的网页爬虫

### 声明

仅供科研用途，我恕不承担由于使用这一项目造成的一切后果。

### 为什么要把爬虫放在CloudFlare Workers上？本地爬虫/GitHub API不好用吗？

1. GitHub API 的每小时5000次 Rate Limit 在构建数据集时可能不够用
2. Cloudflare workers 到 GitHub的网络快
3. Cloudflare 自带IP池, 爬虫不容易被封

### 要怎么用？

#### Python

1. 安装两个依赖：`aiohttp`和`tqdm` （您可能需要python>=3.7 以及 tqdm >= 4.62.0）
2. 在`example/github_client.py`中有一个简单的python异步客户端实现，您可以把`github_client.py`复制到自己的项目中。示例用法如下：
  ```python
  # 创建一个客户端
  scraper = GithubScraperClient(
      baseurl="https://scraper.12f23eddde.workers.dev/github", auth="OSSLab@PKU"
  )
  
  # 构造请求列表 [(name_with_owner, pr_number)]
  name_with_owner = ["focus-trap/focus-trap"]
  pr_number = [114]
  queries = [(nam, pr) for nam, pr in zip(name_with_owner, pr_number)]
  print(queries)
  
  # 回调函数(python没法写多行lambda，所以这样实现)
  # results 是所有请求结果的列表，params 是请求参数
  def callback(results: list, params: dict) -> None:
      if len(results) == 0:
          return
      # 打印结果
      print(params["name"], results[-1])

  # 获取pr body
  scraper.get_pulls_with_callback(queries, callback)
  # 获取项目的issue
  scraper.get_issue_lists_with_callback(name_with_owner, callback)
  ```
  
  以下代码可以把结果保存到mongodb：
  
  ```python
  client = MongoClient(mongo_url)
  db_proj = client.dependabot_projects
  
  # 保存到mongodb
  def callback(results: list, params: dict) -> None:
      if len(results) == 0:
          return
      for result in results:
          db_proj.pull_request_body.insert_one({
              **result,
              "name_with_owner": params["owner"] + "/" + params["name"],
              "id": params["id"]
          })
  ```


### 怎么实现其他的爬虫？

请参考`src/common`, `src/github`和[Cloudflare文档](https://developers.cloudflare.com/workers/).

