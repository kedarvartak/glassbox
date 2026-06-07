# glassbox clean — the cleaner: dry-run eviction plan, then the lossless fork.
# The fork writes a NEW sibling session; the original is never touched.
# Record: GLASSBOX_DEMO_SESSION=<session.jsonl> vhs assets/demos/clean.tape
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

# 1. dry run — see exactly what provable garbage would be removed, nothing written
Sleep 700ms
Type "glassbox clean $S"
Sleep 500ms
Enter
Sleep 4s

# 2. fork — write a cleaned, lossless sibling session (original untouched)
Type "glassbox clean $S --fork --yes"
Sleep 500ms
Enter
Sleep 5s
