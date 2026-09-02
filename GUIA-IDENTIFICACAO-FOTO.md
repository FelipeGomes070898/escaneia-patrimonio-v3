# Guia — identificar o item automaticamente pela foto

Isso faz o sistema olhar a foto do bem (a mesma que você já tira no levantamento) e sugerir sozinho o que é — tipo "Mesa de escritório" ou "Cadeira giratória" — preenchendo a Descrição pra você só conferir e ajustar. É a mesma ideia de tirar a foto e perguntar pro Google/Gemini, só que já dentro do Escaneia Patrimônio.

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

Na tela de Levantamento, assim que você tira a **primeira foto do item** (a foto do bem inteiro, não a da etiqueta), o sistema manda essa foto pra IA identificar e, se conseguir, já preenche a Descrição com uma sugestão curta — aparece uma mensagem tipo "Sugestão automática pela foto: 'Mesa de escritório'. Confira e ajuste se precisar." Você pode apagar e digitar outra coisa a qualquer momento, é só uma sugestão pra agilizar.

Se você já tiver digitado alguma coisa na Descrição antes de tirar a foto, o sistema não sobrescreve — só sugere quando o campo está vazio.
