---
name: pm-check
description: Program Manager Health Check - Linear project status review
user_invocable: true
---

# ShopGraph PM Health Check — Linear Hygiene

Quick health check focused on catching Linear status drift. Run this after any sprint of work to keep the board honest.

## Instructions

1. **Get all ShopGraph issues** from the SpinOuts project (ID: `52fb78a7-28c7-4d93-9973-00477f8d1337`) using `mcp__linear__linear_getProjectIssues` with limit 100. Use the Agent tool to read and analyze the result file.

2. **Filter to ShopGraph only** — include issues with "ShopGraph" in the title, plus known ShopGraph tickets (LAU-248 through LAU-308). Exclude SceneInBloom, Atlas, kb.computer, TrustKit, TrustMem, veryboringui, and portfolio-only tickets.

3. **Cross-reference Linear state vs reality.** For each issue:
   - Read the issue status in Linear
   - Read the issue description for completion markers ("COMPLETE", "SHIPPED", "BUILT", "LIVE")
   - Check CLAUDE.md for any mentions of the ticket being done
   - Check git log for recent commits referencing the ticket ID

4. **Report hygiene issues in a table:**

| ID | Title | Linear Status | Evidence of Completion | Recommended Action |
|----|-------|--------------|----------------------|-------------------|

Categories of hygiene issues:
- **Ghost Done**: Linear says Backlog/Todo but description says COMPLETE/SHIPPED — mark Done
- **Ghost Active**: Linear says In Progress but no updates in 14+ days — move to Backlog or close
- **Priority Drift**: Marked Urgent but work is shipped or resolved — downgrade priority
- **Zombie**: Superseded by another ticket or approach changed — cancel with note
- **Missing Status**: No Linear status set at all — triage and set status

5. **After identifying issues, ask the user**: "Found N hygiene issues. Fix them now?"

6. **If user confirms**, batch-update all issues using `mcp__linear__linear_updateIssue`. Add a comment on each explaining the status change.

7. **Quick scoreboard** after fixes:
| Metric | Before | After |
|--------|--------|-------|
| Done | N | N |
| Backlog | N | N |
| Urgent (P1) | N | N |

## Workflow State IDs (Laundromat team)
- Backlog: dd45831c-dfc0-4bc5-9a9f-ae31bb250fec
- Todo: 22c8d051-d155-427d-839d-0033f1c2c5b9
- In Progress: b4266fdf-c17e-46e5-a233-ef095a76a523
- Done: 2aaf2482-939d-4c11-af01-492ce2713c93
- Canceled: 12ff32ea-23bb-461a-8347-ca457dbd7d2f
- Duplicate: 5c7e19fb-dad8-4e76-9301-df6f80ac7235
