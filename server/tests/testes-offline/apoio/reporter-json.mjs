/**
 * Reporter do node:test que grava cada teste como uma linha JSON
 * (nome, situação, duração e mensagem de falha). Usado pelo executor da
 * caixa-branca para montar o arquivo de evidência.
 */
export default async function* reporterJson(fonte) {
  for await (const evento of fonte) {
    if (evento.type !== 'test:pass' && evento.type !== 'test:fail') continue;
    const { name, todo, details, file } = evento.data;
    if (details && details.type === 'suite') continue;
    const erro = details && details.error;
    const causa = erro && (erro.cause || erro);
    yield JSON.stringify({
      nome: name,
      arquivo: file,
      situacao: todo ? (evento.type === 'test:pass' ? 'todo-passou' : 'defeito-confirmado') : (evento.type === 'test:pass' ? 'aprovado' : 'reprovado'),
      motivoTodo: typeof todo === 'string' ? todo : undefined,
      duracaoMs: details ? Math.round(details.duration_ms * 10) / 10 : undefined,
      mensagem: causa ? String(causa.message || causa).split('\n').slice(0, 6).join(' ').replace(/\s+/g, ' ').trim() : undefined
    }) + '\n';
  }
}
