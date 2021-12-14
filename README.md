# 使用CloudFlare Workers的网页爬虫

###为什么要做这个？

Cloudflare workers 到境外网站的网络快，且自带IP池


### 要怎么用？

在`example/github_client.py`中实现了一个简单的python异步客户端。以下代码可以创建一个Client:

```python
scraper = GithubScraperClient(baseurl="https://scraper.12f23eddde.workers.dev/github", auth="OSSLab@PKU")
```


### 怎么实现其他的爬虫？

请参考`src/github`和[Cloudflare文档](https://developers.cloudflare.com/workers/).

