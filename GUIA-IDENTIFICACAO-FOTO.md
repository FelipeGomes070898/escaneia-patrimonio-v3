# Guia — identificar o item e ler etiquetas apagadas automaticamente

Uma única chave (`GEMINI_API_KEY`) liga **duas** coisas no sistema:

1. **Identificar o item pela foto** — olha a foto do bem inteiro e sugere sozinho o que é (tipo "Mesa de escritório" ou "Cadeira giratória"), preenchendo a Descrição pra você só conferir e ajustar. É a mesma ideia de tirar a foto e perguntar pro Google/Gemini, só que já dentro do Escaneia Patrimônio.
2. **Ler etiquetas de tombo apagadas/antigas** — quando a leitura rápida (OCR) não consegue achar o número na foto da etiqueta (etiquetas velhas, riscadas, desbotadas), o sistema tenta de novo com essa mesma IA numa versão da foto com contraste bem realçado. Não é uma "luz ultravioleta" de verdade — celular não capta isso —, mas na prática ajuda bastante a ler números quase apagados.

Isso é **opcional**: sem configurar, o site funciona 100% normal, só não vai sugerir a descrição sozinho (você digita, como já faz hoje).

## 1. Pegar a chave gratuita no Google AI Studio

1. Entre em [aistudio.google.com/apikey](https://aistudio.google.com/apikey) com a mesma conta Google que você já usa (a `@seduc...`, por exemplo).
2. Clique em **Create API key** (ou **Criar chave de API**).
3. Se pedir pra escolher um projeto, pode usar o mesmo projeto do Google Cloud que você já criou pro Drive (`escaneia-patrimonio`) ou deixar criar um novo — tanto faz.
4. Copie a chave gerada (uma sequência de letras/números).

Essa chave tem uma cota gratuita generosa (bem mais do que o suficiente pro dia a dia do levantamento). Se um dia passar do limite gratuito, o Google simplesmente não responde naquele momento — o sistema não trava, só não sugere a descrição daquela vez.

## 2. Colocar na Vercel

Em **Project → Settings → Environment Variables**, adicione:

| Nome | Valor |
|---|---|
| `GEMINI_API_KEY` | a chave que você copiou no passo 1 |

Depois, em **Deployments** → três pontinhos do último deploy → **Redeploy**.

## Como funciona

**Identificar o item:** assim que você tira a **primeira foto do item** (a foto do bem inteiro, não a da etiqueta), o sistema manda essa foto pra IA identificar e, se conseguir, já preenche a Descrição com uma sugestão curta — aparece uma mensagem tipo "Sugestão automática pela foto: 'Mesa de escritório'. Confira e ajuste se precisar." Você pode apagar e digitar outra coisa a qualquer momento, é só uma sugestão pra agilizar.

**Ler etiqueta apagada:** ao tirar a foto da etiqueta, o sistema tenta ler o número normal primeiro (rápido, sem precisar da IA). Se não achar nada, tenta de novo automaticamente com a IA numa versão com contraste realçado da mesma foto — junto com o número, também tenta pegar a "Desc. analítica" da etiqueta (quando ela tiver esse campo) pra já ajudar a preencher a Descrição.

Se você já tiver digitado alguma coisa na Descrição antes de tirar a foto, o sistema não sobrescreve — só sugere quando o campo está vazio.

## E se a etiqueta realmente não existir ou estiver ilegível mesmo assim?

Na tela de Levantamento, logo abaixo das fotos, tem o botão **"Este item não tem etiqueta/tombo nenhuma"**. Marcando ele, dá pra salvar o item só com a(s) foto(s) e a descrição, sem precisar de nenhum número — o item entra na planilha marcado como "Sem etiqueta", pra revisar/tombar depois.

## Uma migração de banco a mais

Esse recurso (e o de medidas do item) usa colunas novas na tabela `patrimonio_registros`. Depois de configurar a chave, rode também o `schema-v8.sql` no SQL Editor do Supabase (mesmo passo que você já fez pros arquivos `schema-v2.sql` até `schema-v7.sql`) — sem isso, salvar um item sem etiqueta ou com medidas preenchidas vai dar erro.
