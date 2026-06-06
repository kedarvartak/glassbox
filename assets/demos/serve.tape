# glassbox serve — launch the local, read-only web inspector.
# Record: vhs assets/demos/serve.tape
Output assets/demos/serve.gif

Set Shell bash
Set FontSize 14
Set Width 1280
Set Height 210
Set Padding 22
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type "export PATH=$HOME/.local/bin:$PATH; PS1='$ '"
Enter
Type "clear"
Enter
Show

Sleep 700ms
Type "glassbox serve"
Sleep 400ms
Enter
Sleep 4s
Ctrl+C
Sleep 1500ms
