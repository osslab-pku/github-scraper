import { generateJSONResponse, generateErrorResponse } from '../common/response';
import { fieldMap, HTMLParser, zip } from '../common/htmlparser'
import { fetchURL, getParams } from '../common/request'

const sampleTimelineRequest = {
  name: "caddy",
  owner: "caddyserver",
  id: 1
};

const defaultTimelineRequest = {};

async function parseTimeline(response){
  const parser = new HTMLParser();

  // global
  parser.addTextParser('title', '.gh-header-title .markdown-title', 'global');
  parser.addTextParser('id', '.gh-header-title .color-fg-muted', 'global')
  parser.addCaseParser('state', {
    '.gh-header-meta span.State[title~="Open"]': 'open',
    '.gh-header-meta span.State[title~="Closed"]': 'closed',
    '.gh-header-meta span.State[title~="Merged"]': 'merged'
  }, 'global')

  parser.addTextParser('author', '.gh-header-meta [data-hovercard-type="user"]', 'global')
  parser.addAttributeParser('actedAt', '.gh-header-meta relative-time', 'datetime', 'global');

  parser.addAttributeParser('base', '.gh-header-meta .commit-ref:not(.head-ref)', 'title', 'global')
  parser.addAttributeParser('head', '.gh-header-meta .head-ref', 'title', 'global')

  parser.addAttributeParser('labels', '.js-discussion-sidebar-item a.IssueLabel',
    'data-name', 'global');
  parser.addAttributeParser('linkedPulls', '.js-discussion-sidebar-item [data-hovercard-type="pull_request"]',
    'href','global');
  parser.addAttributeParser('linkedIssues', '.js-discussion-sidebar-item [data-hovercard-type="issue"]',
    'href', 'global');

  parser.addAttributeParser('reviewers', '.js-issue-sidebar-form[aria-label="Select reviewers"] [data-hovercard-type="user"]',
    'data-assignee-name', 'global');
  parser.addAttributeParser('assignees', '.js-issue-sidebar-form[aria-label="Select assignees"] [data-hovercard-type="user"]',
    'data-assignee-name', 'global');
  parser.addAttributeParser('milestones', '.js-issue-sidebar-form[aria-label="Select milestones"] a[href]',
    'title', 'global');

  // timeline items
  parser.addKeyParser('.TimelineItem', (element, key)=>{
    if (typeof key !== "number"){
      return 0;
    }
    return key+1;
  })

  parser.addCaseParser('type', {
    '.js-comment-body': "comment",
    // event type -> svg class
    // '.TimelineItem-badge': "event",  // unknown event
    'svg.octicon-tag': "label",
    'svg.octicon-milestone': "milestone",
    'svg.octicon-repo-push': "push",
    'svg.octicon-eye': "review",
    'svg.octicon-cross-reference': "reference",
    'svg.octicon-file-diff': "file-diff",
    'svg.octicon-git-pull-request-closed': "close",
    'svg.octicon-git-merge': "merge",
    'svg.octicon-git-branch': "branch",
    'svg.octicon-git-commit': "commit",
    'svg.octicon-issue-closed': "close",
    'svg.octicon-pencil': "edit",
    'svg.octicon-x': "blocked",
    'svg.octicon-rocket': "deploy",
    'svg.octicon-check': "approve",
    'svg.octicon-person': "assign",
    'svg.octicon-git-pull-request': "pull-request",
    'svg.octicon-project': "project",
    'svg.octicon-git-pull-request-draft': "draft",
    'svg.octicon-bookmark': "duplicate"
  })

  parser.addTextParser('author', '.author[data-hovercard-type="user"]')
  parser.addTextParser('bot', '.author:not([data-hovercard-type="user"])')
  parser.addAttributeParser('actedAt', 'relative-time', 'datetime');
  parser.addAttributeParser('actedAt', 'time-ago', 'datetime');

  // comments
  parser.addTextParser('authorLabels', '.timeline-comment-header .Label')
  parser.addTextParser('raw','.comment-body');

  // try to collect texts (note: won't filter out inline code)
  parser.addTextParser('text','.comment-body > p[dir="auto"]');
  parser.addTextParser('code','.comment-body code');
  parser.addCaseParser('isEdited', {
    '.js-comment-edit-history-menu': true
  })
  parser.addTextParser('mentionedUsers', '.comment-body .user-mention');
  parser.addAttributeParser('mentionedLinks', '.comment-body a[href^="http"]', 'href');
  // images cached by GitHub
  parser.addAttributeParser('mentionedImages', 'img[data-canonical-src]', 'data-canonical-src');
  // not a user avatar
  parser.addAttributeParser('mentionedImages', 'img:not([data-canonical-src]):not([src*="https://avatars.githubusercontent.com"])', 'src');

  // parser.addAttributeParser('reactions', '.comment-reactions-options > button', 'aria-label');
  parser.addTextParser('reactions', '.comment-reactions-options g-emoji');
  parser.addTextParser('reactionsCount', '.comment-reactions-options span');

  // events
  parser.addTextParser('text','[class="TimelineItem-body"]');
  parser.addAttributeParser('labels', '[class="TimelineItem-body"] a.IssueLabel', 'data-name');
  parser.addAttributeParser('mentionedLinks', '[class="TimelineItem-body"] [href]', 'href');
  // parser.addTextParser('title', '[class="TimelineItem-body"] .markdown-title');  // TODO why truncated
  parser.addCaseParser('state', {
    '[class="TimelineItem-body"] span.State[title~="Open"]': 'open',
    '[class="TimelineItem-body"] span.State[title~="Closed"]': 'closed',
    '[class="TimelineItem-body"] span.State[title~="Merged"]': 'merged'
  })

  // file diff comment (request change)
  parser.addTextParser('text','.TimelineItem-body.flex-md-row.flex-column .flex-md-self-center');


  let res = await parser.parse(response)

  // transform
  res = fieldMap(res, 'id', v => v[0].trim().substring(1));
  res = fieldMap(res, 'author', v => v[0].trim())
  res = fieldMap(res, 'bot', v => v[0].trim())

  res = fieldMap(res, 'head', v => v[0].trim())
  res = fieldMap(res, 'base', v => v[0].trim())

  res = fieldMap(res, 'authorLabels', v => v.map(t => t.trim()))
  res = fieldMap(res, 'labels', v => v.map(t => t.trim()))

  res = fieldMap(res, 'actedAt', v => v[0])
  res = fieldMap(res, 'text', v => v.map(t => t.trim()).join(' ').trim().replace('\n', ''))
  res = fieldMap(res, 'title', v => v[0].trim())
  res = fieldMap(res, 'state', v => v[0])
  res = fieldMap(res, 'type', v => v[0])
  res = fieldMap(res, 'isEdited', v => v[0])

  res = fieldMap(res, 'mentionedUsers', v => v.map(t => t.trim().substring(1)))

  // links -> add https to github internals -> filter non-http -> unique
  res = fieldMap(res, 'mentionedLinks', v => v.map(t => {
    if (t.startsWith("/")){
      return "https://github.com" + t;
    } else {
      return t;
    }
  }).filter(t => t.startsWith("http"))
    .filter((item, index, array) => array.indexOf(item) === index))

  res = fieldMap(res, 'reactions', (v, k) => {
    return zip(v, res[k]['reactionsCount']);
  })

  // remove unnecessary fields
  res = fieldMap(res, 'reactionsCount', () => undefined);

  return res;
}

export async function handleTimeline(request){
  const {headers, method, url} = request;
  const urlObject = new URL(url);

  const params = getParams(request, defaultTimelineRequest, sampleTimelineRequest);

  let queryComponent = null;
  if (urlObject.pathname.includes("issue")){
    queryComponent = "/issues/"
  } else if (urlObject.pathname.includes("pull")){
    queryComponent = "/pull/"
  } else {
    throw new Error("Request is not issues or pulls");
  }

  const reqURL = "https://github.com/" + params.owner + "/" + params.name + queryComponent
    + params.id;
  // console.log(reqURL);

  const response = await fetchURL(reqURL);
  const res = await parseTimeline(response);

  // transform
  const ret = { "data": [], "url": reqURL };

  for(let entry in res){
    if(entry === "$keyIsNull") {
      ret["uncollected"] = res[entry];
      continue;
    }
    ret["data"].push({
      "itemId": entry,
      ...res[entry]
    })
  }

  return generateJSONResponse(ret);
}
