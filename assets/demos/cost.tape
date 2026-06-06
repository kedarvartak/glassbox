# glassbox cost — cost from provider actuals, cache-read recarry broken out.
# Record: vhs assets/demos/cost.tape
Output assets/demos/cost.gif

Set Shell bash
Set FontSize 14
Set Width 1280
Set Height 440
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
Type "glassbox cost $S"
Sleep 500ms
Enter
Sleep 5s
