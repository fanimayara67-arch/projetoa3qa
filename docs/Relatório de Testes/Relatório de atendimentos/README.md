# Evidências — Relatório de atendimentos (gráfico e PDF)

Capturas feitas durante os testes manuais do relatório de atendimentos do painel do gestor
(`/tecnico/` → Ambiente Gestor → Relatório de atendimentos).

| Arquivo | O que mostra |
|---|---|
| [01-relatorio-com-grafico-funcionando.png](evidencias/01-relatorio-com-grafico-funcionando.png) | Relatório gerado com o gráfico "Atendimentos por tipo de defeito" e os botões Baixar PDF, Imprimir, Salvar/Enviar e WhatsApp. |
| [02-erro-ao-carregar-atendimentos.png](evidencias/02-erro-ao-carregar-atendimentos.png) | Erro "Não foi possível carregar os atendimentos" ao gerar o relatório. |
| [03-erro-persiste-apos-recarregar.png](evidencias/03-erro-persiste-apos-recarregar.png) | O mesmo erro depois de recarregar a página. |
| [04-relatorio-travado-em-gerando.png](evidencias/04-relatorio-travado-em-gerando.png) | Relatório parado no aviso "Gerando relatório…". |
| [05-erro-endereco-sem-barra-final.png](evidencias/05-erro-endereco-sem-barra-final.png) | Erro de carregamento enquanto a página ainda era aberta em `/tecnico`, sem a barra final. |
| [execucao-automatizada.txt](evidencias/execucao-automatizada.txt) | Saída dos testes automatizados do relatório de atendimentos e do relatório de tentativas: 12 aprovados, nenhuma falha. |

## Causa dos erros (prints 02 a 05)

A página estava sendo aberta em `http://localhost:3000/tecnico`, sem a barra final. Nesse endereço o
navegador procura os scripts na raiz do site (`/js/main.js`, `/leaflet.js`, `/jsQR.js`) e recebe 404, então
o relatório não chega a chamar a API. O console do navegador mostrava
`Failed to fetch dynamically imported module: http://localhost:3000/js/main.js`.

**Correção:** um script no início de `public/tecnico/index.html` redireciona `/tecnico` para `/tecnico/`
antes de carregar qualquer arquivo. Depois disso o relatório voltou a funcionar.

## Como repetir os testes automatizados

```bash
cd server
node --test tests/relatorio-atendimentos/relatorio.test.js tests/relatorio-tentativas/tentativas.test.js
```
