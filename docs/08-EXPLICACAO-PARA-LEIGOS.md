# Como o Ilumina Coruripe é organizado

Explicação da arquitetura de software para quem não é da área de tecnologia.

## O que o sistema faz

O sistema ajuda a prefeitura a cuidar da iluminação pública. Ele tem dois aplicativos, que abrem pelo navegador do celular:

- **App do cidadão:** o morador informa que um poste está com defeito, envia a localização por GPS e uma foto.
- **App da equipe:** o técnico vê os chamados e registra o conserto, o gestor acompanha o serviço e o almoxarife controla as peças.

## As três partes principais

Pense em um restaurante:

```text
   CELULAR                 SERVIDOR                  BANCO DE DADOS
  (a mesa)      <--->   (a equipe do       <--->     (a despensa
                         restaurante)                 trancada)
```

| Parte | No restaurante | O que faz |
|---|---|---|
| **Celular** | Mesa | Mostra as telas, lê o GPS e tira a foto |
| **Servidor** | Equipe | Confere quem está pedindo, aplica as regras e organiza o trabalho |
| **Banco de dados e arquivos de fotos** | Despensa | Guarda chamados, postes, peças e usuários |

O cliente não entra na despensa, e o celular também não acessa o banco diretamente. Tudo passa pelo servidor, o que protege os dados.

## A divisão de tarefas

O código é separado por função, como as tarefas de uma equipe:

| Camada | No restaurante | Exemplo no sistema |
|---|---|---|
| **Apresentação** | Garçom: recebe o pedido e entrega a resposta | Formulário e botão "Enviar reporte" |
| **Aplicação** | Gerente: coordena as etapas | "Para fechar um chamado, siga estes passos" |
| **Domínio** | Regras da casa | "Um chamado já fechado não pode ser fechado de novo" |
| **Infraestrutura** | Estoquista: busca e guarda as coisas | Gravar no banco e salvar a foto |
| **Dados** | Despensa | As informações guardadas |

Com essa divisão, mudar o visual de uma tela não deveria afetar as regras, e os erros ficam mais fáceis de encontrar. As regras também podem ser testadas sem um banco de dados real.

O nome técnico é **monólito modular**: é um único programa, como um só restaurante com setores bem definidos. Para o tamanho do projeto, isso é mais simples e barato do que manter vários sistemas separados.

## Três situações do dia a dia

### 1. O morador está sem internet

1. O app guarda o reporte no próprio celular.
2. Quando a conexão volta, ele tenta enviar de novo.
3. Se falhar, espera cada vez mais entre as tentativas: 30 segundos, 1 minuto, 2 minutos e assim por diante.

### 2. O mesmo reporte é enviado duas vezes

Cada reporte tem um código único, criado no celular. Se ele chegar de novo, o servidor reconhece o código e não cria um chamado duplicado.

### 3. Dois técnicos fecham o mesmo chamado ao mesmo tempo

- O primeiro "tranca" o chamado enquanto o registro é feito.
- O segundo espera e depois recebe o aviso de que o chamado já foi fechado.
- O fechamento segue a regra do **tudo ou nada**: se faltar uma peça no estoque, o registro inteiro é desfeito. Assim, o chamado não fica fechado com o estoque errado.

## O que ainda não está funcionando

> Situação verificada em 05/11/2026. A lista completa está em [Problemas e pendências](09-PROBLEMAS-E-PENDENCIAS.md).

A explicação acima descreve a arquitetura planejada, e **ela ainda está sendo ligada às telas e ao banco de dados**. É como ter a cozinha nova pronta, com só parte dos garçons levando os pedidos para ela.

- **App do cidadão:** ainda usa o código antigo, e o servidor recusa o reporte no formato enviado (erro 400).
- **App da equipe:** login, lista de chamados, rota do dia e fechamento administrativo já usam o servidor novo. As outras funções ainda não.
- **Banco de dados:** a equipe adotou o MySQL, mas as tabelas ainda não foram criadas, e parte do servidor ainda usa comandos de outro banco, o PostgreSQL.
- **Testes:** os 36 testes automáticos passam, mas usam um banco simulado nas gravações. Eles não comprovam o funcionamento com um banco real.
- **Site no ar:** segundo o [`README.md`](../README.md), o que está publicado ainda são os dois sites antigos.

Em resumo, a arquitetura está construída e parcialmente integrada, mas o sistema ainda não funciona de ponta a ponta.
