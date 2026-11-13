# Rodada anterior (substituída)

Esta pasta guarda, sem alterações, a primeira rodada dos testes offline: os relatórios de caixa-preta e caixa-branca, as evidências e os scripts usados na época. Os scripts estão com a extensão `.antigo.js` / `.antigo.mjs` para não serem executados pelo `npm test`.

A rodada foi refeita porque ainda não está decidido se o servidor do projeto será o Google Apps Script ou a API Node. A nova rodada testa os dois cenários separadamente, em [API Node](../API%20Node/) e [Apps Script](../Apps%20Script/). Veja o [índice dos testes offline](../README.md).

Problemas desta rodada que motivaram a mudança:

- **Cobertura desigual:** 20 casos no Apps Script e só 3 na API Node.
- **Duplicidade medida de jeitos diferentes:** num modo o teste contava os envios recebidos; no outro, os registros gravados.
- **Servidor de teste incompleto:** a API Node rodava com repositórios incompletos, então o fechamento não passaria nem com o app corrigido.
- **Técnico fora da tela:** o técnico entrava por uma sessão injetada e fechava chamados alterando variáveis internas da página, sem usar a tela.
- **Esperas por tempo fixo** em vez de esperas por condição.

Os arquivos daqui podem ser apagados quando o grupo não precisar mais deles.
