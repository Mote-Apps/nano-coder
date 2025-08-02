# Commit Changes Command

Create a commit with all staged and unstaged changes, generate a commit message, ask for approval, and push to remote.

I'll perform the following steps for your commit:

## 1. Analyze Current Changes

- Check git status to see all modified, added, and deleted files
- Review git diff to understand the nature of changes
- Examine recent commit history to match the repository's commit message style

## 2. Stage All Changes

- Add all untracked and modified files to the staging area
- Ensure all relevant changes are included in the commit

## 3. Generate Commit Message

- Analyze the changes to determine the type of modification (feature, fix, update, etc.)
- Create a concise, descriptive commit message following the repository's conventions
- Do NOT include Claude Code footer or co-authorship attribution

## 4. Request Approval

- Present the proposed commit message to you for review
- Wait for your approval before proceeding
- Allow you to modify the message if needed

## 5. Commit and Push

- Create the commit with the approved message
- Push the changes to the remote repository
- Confirm successful completion

This command ensures that all changes are properly committed with a meaningful message and safely pushed to the remote repository.
