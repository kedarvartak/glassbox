# glassbox clean — the cleaner: dry-run plan, the confirmation gate, staged /compact.
# Non-destructive: the --apply step answers "n" so the repo's CLAUDE.md is untouched.
# Record: vhs assets/demos/clean.tape
Output assets/demos/clean.gif

Set Shell bash
Set FontSize 13
Set Width 1320
Set Height 1100
Set Padding 22
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type "export PATH=$HOME/.local/bin:$PATH; PS1='$ '; export S=${GLASSBOX_DEMO_SESSION}"
Enter
Type "clear"
Enter
Show

# 1. dry run — see the plan, nothing is written
Sleep 700ms
Type "glassbox clean $S"
Sleep 500ms
Enter
Sleep 4s

# 2. apply — shows the confirmation gate; we answer "n" (read-only demo)
Type "glassbox clean $S --apply"
Sleep 500ms
Enter
Sleep 2500ms
Type "n"
Sleep 400ms
Enter
Sleep 2s

# 3. compact — stage the /compact command for the live session
Type "glassbox clean $S --compact --yes"
Sleep 500ms
Enter
Sleep 4s
