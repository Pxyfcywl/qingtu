; Preserve the original handler across reinstalls. The bundled helper otherwise
; backs up our own ProgID and restores that dangling ProgID during uninstall.
!include LogicLib.nsh
Var QingtuPreviousAssociation
Var QingtuOriginalAssociation

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $QingtuPreviousAssociation SHELL_CONTEXT "Software\Classes\.qmap" ""
  StrCpy $QingtuOriginalAssociation ""
  ${If} $QingtuPreviousAssociation == "轻图思维导图"
    ReadRegStr $QingtuOriginalAssociation SHELL_CONTEXT "Software\Classes\.qmap" "轻图思维导图_backup"
    ${If} $QingtuOriginalAssociation == "轻图思维导图"
      StrCpy $QingtuOriginalAssociation ""
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHELL_CONTEXT "Software\Classes\轻图思维导图\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  ${If} $QingtuPreviousAssociation == "轻图思维导图"
    WriteRegStr SHELL_CONTEXT "Software\Classes\.qmap" "轻图思维导图_backup" "$QingtuOriginalAssociation"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ReadRegStr $QingtuPreviousAssociation SHELL_CONTEXT "Software\Classes\.qmap" ""
  ${If} $QingtuPreviousAssociation != "轻图思维导图"
    ; A handler selected since installation must remain selected.
    WriteRegStr SHELL_CONTEXT "Software\Classes\.qmap" "轻图思维导图_backup" "$QingtuPreviousAssociation"
  ${Else}
    ReadRegStr $QingtuOriginalAssociation SHELL_CONTEXT "Software\Classes\.qmap" "轻图思维导图_backup"
    ${If} $QingtuOriginalAssociation == "轻图思维导图"
      WriteRegStr SHELL_CONTEXT "Software\Classes\.qmap" "轻图思维导图_backup" ""
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.qmap" "轻图思维导图_backup"
  ReadRegStr $QingtuPreviousAssociation SHELL_CONTEXT "Software\Classes\.qmap" ""
  ${If} $QingtuPreviousAssociation == ""
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.qmap" ""
    DeleteRegKey /ifempty SHELL_CONTEXT "Software\Classes\.qmap"
  ${EndIf}
!macroend
