@chcp 65001 >nul
powershell -NoProfile -Command "(Get-Content 'c:\\Users\\famil\\OneDrive\\Área de Trabalho\\projetoa3\\projetoa3qa\\teste-pin\\README.md') -replace '⏳', '✅' | Set-Content 'c:\\Users\\famil\\OneDrive\\Área de Trabalho\\projetoa3\\projetoa3qa\\teste-pin\\README.md'"
echo Done