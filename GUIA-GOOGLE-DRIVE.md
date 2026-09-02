# Guia — ligar o Google Drive nas fotos

Isso permite que as fotos do levantamento (tombo + item) sejam salvas automaticamente na pasta do Google Drive que você já usa, organizadas por local — do mesmo jeito que você já vinha fazendo manualmente.

O acesso é feito por uma "conta de serviço" do Google — uma espécie de robô que só tem permissão pra mexer na pasta que você compartilhar com ele, nada mais da sua conta pessoal.

## 1. Criar um projeto no Google Cloud

1. Entre em [console.cloud.google.com](https://console.cloud.google.com) com a mesma conta Google que tem acesso à pasta do Drive (a conta `@seduc...` que aparece nos seus prints).
2. No topo, clique no seletor de projeto → **New Project**.
3. Dê um nome, tipo `escaneia-patrimonio`, e clique em **Create**.
4. Espere alguns segundos e selecione esse projeto recém-criado (o seletor no topo).

## 2. Ativar a API do Google Drive

1. Na barra de busca do topo, digite **Google Drive API** e clique no resultado.
2. Clique em **Enable** (ativar).

## 3. Criar a conta de serviço

1. No menu lateral (ou na busca), vá em **IAM & Admin** → **Service Accounts**.
2. Clique em **+ Create Service Account**.
3. Dê um nome, tipo `escaneia-patrimonio-drive`, e clique em **Create and Continue**.
4. Nas próximas telas (permissões e acesso de usuários), pode deixar em branco e clicar em **Continue** / **Done** — não precisa dar nenhuma permissão especial aqui.
5. Você vai cair na lista de contas de serviço. **Copie o e-mail dela** (algo como `escaneia-patrimonio-drive@escaneia-patrimonio.iam.gserviceaccount.com`) — vamos usar em dois lugares.

## 4. Gerar a chave

1. Clique na conta de serviço que você acabou de criar.
2. Vá na aba **Keys** (Chaves).
3. Clique em **Add Key** → **Create new key** → escolha **JSON** → **Create**.
4. Um arquivo `.json` vai baixar no seu computador automaticamente. **Guarde esse arquivo** — ele só pode ser gerado uma vez.

## 5. Compartilhar a pasta do Drive com a conta de serviço

1. Abra sua pasta [Levantamento de dados (Antigo Ceforee)](https://drive.google.com/drive/folders/1G9N4SzVROQ4clrhTac5pZFgNBN9jOIY4) no Google Drive (ou a pasta que você quiser usar como raiz).
2. Clique com o botão direito → **Compartilhar** (ou no ícone de pessoa no topo).
3. Cole o **e-mail da conta de serviço** (do passo 3) e dê permissão de **Editor**.
4. Envie/confirme o compartilhamento.

A partir daqui, o sistema consegue criar pastas e subir fotos dentro dessa pasta — mas não em nenhum outro lugar do seu Drive.

## 6. Pegar os valores pra Vercel

Abra o arquivo `.json` que baixou no passo 4 (pode abrir num editor de texto simples, tipo Bloco de Notas). Você vai ver algo assim:

```json
{
  "client_email": "escaneia-patrimonio-drive@....iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n",
  ...
}
```

Na Vercel (Project → Settings → Environment Variables), adicione três variáveis:

| Nome | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | o valor de `client_email` |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | o valor de `private_key` (copie exatamente como está, com as aspas e os `\n`) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | `1G9N4SzVROQ4clrhTac5pZFgNBN9jOIY4` (ou o ID da pasta que você escolheu — é o trecho da URL depois de `/folders/`) |

Depois de adicionar (ou se já publicou antes), vá em **Deployments** → nos três pontinhos do último deploy → **Redeploy**, pra Vercel usar as novas variáveis.

## Como fica organizado

Dentro da sua pasta raiz, o sistema cria automaticamente uma subpasta pra cada **local** cadastrado em Configurações (ex: "Sala 1", "Recepção") e salva ali dentro uma ficha em PDF por item (fotos + dados do registro), nomeada com o número do patrimônio e a descrição — por exemplo `001.234.567 - Cadeira giratória.pdf`.

Isso é uma organização mais simples do que os "Compartimento 1/2/3" que você vinha fazendo à mão — dá pra evoluir depois se você quiser esse nível de detalhe (por exemplo, deixando escolher um "compartimento" dentro do local na hora do cadastro). Por enquanto, cada local vira uma pasta.

## Rodar o script SQL

Não esqueça de rodar o `schema-v4.sql` e o `schema-v5.sql` no Supabase (SQL Editor → colar → Run, um de cada vez) — eles adicionam as colunas que guardam o link da ficha em PDF.
