import { generateJSONResponse, generateErrorResponse } from './common/response';
import { fieldMap, HTMLParser, zip } from './common/htmlparser'
import { fetchURL, getParams } from './common/request'

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

  parser.addAttributeParser('base', '.gh-header-meta .base-ref', 'title', 'global')
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
    'svg.octicon-tag': "tag",
    'svg.octicon-milestone': "milestone",
    'svg.octicon-repo-push': "repo-push",
    'svg.octicon-eye': "eye",
    'svg.octicon-cross-reference': "cross-reference",
  })

  parser.addTextParser('author', '[data-hovercard-type="user"]')
  parser.addAttributeParser('actedAt', 'relative-time', 'datetime');

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

  // parser.addAttributeParser('reactions', '.comment-reactions-options > button', 'aria-label');
  parser.addTextParser('reactions', '.comment-reactions-options g-emoji');
  parser.addTextParser('reactionsCount', '.comment-reactions-options span');

  // events
  parser.addTextParser('text','[class="TimelineItem-body"]');

  let res = await parser.parse(response)

  // transform
  res = fieldMap(res, 'id', v => v[0].trim().substring(1));
  res = fieldMap(res, 'author', v => v[0].trim())
  res = fieldMap(res, 'authorLabels', v => v.map(t => t.trim()))
  res = fieldMap(res, 'labels', v => v.map(t => t.trim()))
  res = fieldMap(res, 'actedAt', v => v[0])
  res = fieldMap(res, 'text', v => v.map(t => t.trim()).join(' ').trim())
  res = fieldMap(res, 'title', v => v[0])
  res = fieldMap(res, 'state', v => v[0])
  res = fieldMap(res, 'type', v => v[0])
  res = fieldMap(res, 'isEdited', v => v[0])

  res = fieldMap(res, 'reactions', (v, k) => {
    return zip(v, res[k]['reactionsCount']);
  })
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
  return generateJSONResponse(res);
}