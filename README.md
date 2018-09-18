# The Comments Problem 💬

Github has [neat statistics](https://github.com/facebook/react/graphs/contributors) for contributors, it shows number of commits and nice charts. But people contribute to Github projects not only via commits. Actually, a lot of contributions happens in issue or pull request comments 💬. Github doesn't have statistics to show "top commenters".

## Main Task

Fetch all existing comments for a given repository for a given period _or till the API limit is exhausted_, group by user and output it sorted by number of comments. The program should execute and look like:

```bash
node index.js --repo <owner>/<repo> --period 20d

  Fetching comments for past 20 days for "<owner>/<repo>"...

  < progress indicator here >

3012 comments, john.boy (20 commits)
1345 comments, hector (2104 commits)
   8 comments, luis (234 commits)  
```

Use the exact output format, notice that numbers are aligned _(this is what [famous](http://blog.npmjs.org/post/141577284765/kik-left-pad-and-npm) left-pad is for)_. There msut be some indicator for the progress of the fetching process.

Fortunately Github has a [great HTTP API](https://developer.github.com/v3/repos/comments/) to help with the task. There are 3 types of comments a person can make, comment on individual commit, comment in Issue/Pull Request or comment in Pull Request review (You can read more in [their docs](https://developer.github.com/v3/guides/working-with-comments/)).

Mentioned 3 types of comments can be accessed using the following API endpoints:

- [Get Commit Comments](https://developer.github.com/v3/repos/comments/#list-commit-comments-for-a-repository)
- [Get Issues Comments](https://developer.github.com/v3/issues/comments/#list-comments-in-a-repository)
- [Get Pull Requests Comments](https://developer.github.com/v3/pulls/comments/#list-comments-in-a-repository)

After each name there is number of commits, here is an API to help fetch that:

- [Get Statistics Per Collaborator](https://developer.github.com/v3/repos/statistics/#get-contributors-list-with-additions-deletions-and-commit-counts)

Use "total".

## Requirements

* Support `--repo` and `--period` parameters as indicated above, if `--period` is not specified assume infinite and keep fetching till API Limits are exhausted. `--period` only needs to support days in a format `25d` where `25` is number of days.
* Focus on making code readable.
* Create small, focused commits.
* Test code with repositories of different sizes.
* Just like with about any API respect [Github's rate limits.](https://developer.github.com/v3/rate_limit/) Handle errors when limit is exceeded. Reflect remaining limits in progress indicator. Make to not hit [abuse limits](https://developer.github.com/v3/guides/best-practices-for-integrators/#dealing-with-abuse-rate-limits).
* Use any package, except ones that wrap Github API. The API mus be used natively for this challenge.
* All packages must be installed in `package.json`.


## Setup

[Create personal access token](https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/), save it, and then use it to access API to get 5000 requests/hour.

To get started:

- install node 8.9
- `cd` into repository directory
- run `npm install`
- create `src/token/__do-not-commit-me__.js` file and add token there like that:
```js
module.exports = '<token>'
```
- run `npm start`
- make sure to see the following output
```bash
Your github token is:
<your token>
<details of your github account>
```
Remove this entry code afterwards. Mentioned file is added to `.gitignore` already.
- run `npm run dev`, this will start development server (nodemon) that monitors changes and re-runs the script for faster development cycle
- see `example.js` for how it's done, have fun :tada:

## ...Finally
Run `npm run eslint:fix` and fix all issues.
