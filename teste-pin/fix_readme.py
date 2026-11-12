import sys
with open('c:\\Users\\famil\\OneDrive\\Área de Trabalho\\projetoa3\\projetoa3qa\\teste-pin\\README.md', 'r', encoding='utf-8') as f:
    content = f.read()
new_content = content.replace('Em andamento', 'Concluído')
with open('c:\\Users\\famil\\OneDrive\\Área de Trabalho\\projetoa3\\projetoa3qa\\teste-pin\\README.md', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('Done')