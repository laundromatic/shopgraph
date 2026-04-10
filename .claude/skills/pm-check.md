---
name: pm-check
description: Quick ShopGraph program manager health check. Run at session start or after deploys. Shows initiative progress, blocked issues, in-progress status, and suggested next task.
user_invocable: true
---

# ShopGraph PM Check — Quick Health Pulse

Run a focused health check on ShopGraph issues in Linear.

## Instructions

1. **Get ShopGraph issues** from the SpinOuts project (ID: `52fb78a7-28c7-4d93-9973-00477f8d1337`) using `mcp__linear__linear_getProjectIssues`. Use the Agent tool to process the large result file if needed.

2. **Filter to ShopGraph only** — include issues with "ShopGraph" in the title, plus these known ShopGraph tickets: LAU-251, LAU-259, LAU-265, LAU-273, LAU-274, LAU-275, LAU-277, LAU-279, LAU-280, LAU-281, LAU-282, LAU-283, LAU-285, LAU-287, LAU-288, LAU-289, LAU-290, LAU-293, LAU-296, LAU-297, LAU-298, LAU-299, LAU-300. Exclude SceneInBloom, Atlas, kb.computer, TrustKit, TrustMem, and portfolio tickets.

3. **Report these sections** (keep it concise — this is a pulse, not an audit):

### Status Snapshot
- Total ShopGraph issues | Done | In Progress | Backlog
- Completion % (done / total non-canceled)

### In Progress
List each in-progress issue: ID, title, 1-line status summary from description/comments.

### Blocked
Any issues with blocking dependencies or external blockers. Include blocker reason.

### Due Soon (next 7 days)
Issues with due dates in the next 7 days.

### Stale (7+ days no update)
In-progress issues not updated in 7+ days. Include last update date.

### Suggested Next Task
Based on priority, dependencies, and what's unblocked — recommend what to work on next. Consider the dependency chain and what unblocks the most downstream work.

## Output Format

Use a compact table format. No lengthy descriptions. This should fit in one screen.
