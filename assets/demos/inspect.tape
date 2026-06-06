# glassbox inspect — the full session dashboard.
# Record: vhs assets/demos/inspect.tape
Output assets/demos/inspect.gif

Set Shell bash
Set FontSize 13
Set Width 1320
Set Height 1280
Set Padding 22
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type "export PATH=$HOME/.local/bin:$PATH; PS1='$ '; export S=${GLASSBOX_DEMO_SESSION}"
Enter
Type "clear"
Enter
Show

Sleep 700ms
Type "glassbox inspect $S"
Sleep 500ms
Enter
Sleep 6s
