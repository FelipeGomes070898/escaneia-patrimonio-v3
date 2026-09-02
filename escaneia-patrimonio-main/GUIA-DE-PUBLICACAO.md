# Guia rápido — publicar o novo Escaneia Patrimônio

Este é o passo a passo pra colocar o site novo no ar. Ele usa o **mesmo projeto do Supabase** do Radar de Investimentos (nada do Radar é apagado ou alterado).

## 1. Rodar os scripts SQL no Supabase (nesta ordem)

1. Entre no [supabase.com](https://supabase.com), abra o projeto.
2. Vá em **SQL Editor** → **New query**.
3. Abra o arquivo `schema-v2.sql` (nesta pasta), copie **todo** o conteúdo, cole e clique em **Run**. Deve aparecer "Success".
4. Repita o mesmo, em ordem, com `schema-v3.sql`, `schema-v4.sql`, `schema-v5.sql` e `schema-v6.sql` — cada um numa query nova.

O `schema-v3.sql` traz o sistema de permissões (gestor / recrutador / colaborador). O `schema-v4.sql` e o `schema-v5.sql` adicionam as colunas da ficha em PDF que vai pro Google Drive. O `schema-v6.sql` adiciona as colunas usadas na planilha de regularização (explicado mais abaixo). Nenhum desses scripts apaga nada, nem do Escaneia Patrimônio nem do Radar de Investimentos.

## 2. Ativar login por e-mail (se ainda não estiver)

No Supabase: **Authentication** → **Providers** → confirme que **Email** está habilitado.

Se quiser o botão "Entrar com Google" funcionando, em **Authentication** → **Providers** → **Google**, siga as instruções da própria tela do Supabase. Isso é opcional — o login por e-mail e senha já funciona sem isso.

## 3. Pegar a chave "service_role" (só pra você, não me manda ela)

Essa chave é diferente da `anon public` que já usamos: ela dá acesso total ao banco e por isso só pode ficar guardada no servidor (na Vercel), nunca no código nem em mensagens. Ela é necessária pra função de "cadastrar novo usuário" funcionar.

Em **Project Settings** → **API**, copie a chave em **service_role** (tem um aviso de "secret" do lado). Guarde ela — você vai colar direto na Vercel no passo 5, sem precisar me mostrar.

## 4. Subir o código pro GitHub

Esse projeto é um site de verdade (Next.js), então ele precisa ficar num repositório do GitHub pra poder ser publicado na Vercel.

Se você tiver o Git instalado no computador, dentro da pasta do projeto:

```
git init
git add .
git commit -m "Novo site Escaneia Patrimônio"
```

Depois crie um repositório novo no GitHub (ex: `escaneia-patrimonio-v2`) e siga as instruções que o próprio GitHub mostra pra enviar o código (`git remote add origin ...` e `git push`).

Se preferir, me avise que te ajudo a fazer esse envio junto com você, passo a passo.

## 5. Publicar na Vercel

1. Entre em [vercel.com](https://vercel.com) com sua conta.
2. **Add New** → **Project** → escolha o repositório que você acabou de criar.
3. Antes de clicar em "Deploy", abra **Environment Variables** e adicione:

   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://edymwmjhivjwxndekvbr.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave "anon public" (está no `.env.local` que veio junto, ou em Project Settings → API) |
   | `SUPABASE_SERVICE_ROLE_KEY` | a chave "service_role" que você pegou no passo 3 |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | veja o guia `GUIA-GOOGLE-DRIVE.md` |
   | `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | veja o guia `GUIA-GOOGLE-DRIVE.md` |
   | `GOOGLE_DRIVE_ROOT_FOLDER_ID` | veja o guia `GUIA-GOOGLE-DRIVE.md` |
   | `GEMINI_API_KEY` | opcional — veja o guia `GUIA-IDENTIFICACAO-FOTO.md` |

   As duas primeiras (Supabase URL/anon) podem ficar como variável comum. As demais são sensíveis — na Vercel, isso já fica protegido por padrão (não aparecem pro navegador do usuário de jeito nenhum, só são lidas pelo servidor).

   Se você ainda não configurou o Google Drive ou a identificação por foto, pode publicar sem essas variáveis de qualquer forma — o site funciona normalmente (cadastro sem foto funciona liso, e sem sugestão automática de descrição); só vai dar erro se alguém tentar anexar uma foto antes de você terminar o passo do Drive. Configure quando puder e clique em **Redeploy** depois.

4. Clique em **Deploy**. Em cerca de 1 minuto o site estará no ar, com um link tipo `https://escaneia-patrimonio-v2.vercel.app`.

## 6. Virar gestor (só na primeira vez)

1. Acesse o site publicado e clique em **Criar conta**, com o seu e-mail.
2. Volte no Supabase, **SQL Editor**, e rode (trocando pelo seu e-mail de verdade):

   ```sql
   update patrimonio_perfis set role = 'gestor', aprovado = true where email = 'seu-email@exemplo.com';
   ```

3. Pronto — faça login de novo (ou atualize a página) e você já entra como **gestor**, com acesso total.

Depois disso, você não precisa mais mexer em SQL: tudo se gerencia pela tela **Usuários** dentro do próprio site.

## Como funciona o sistema de permissões

- **Gestor**: acesso total. Cadastra qualquer tipo de usuário (colaborador, recrutador ou outro gestor), troca o papel de qualquer pessoa e revoga o acesso de qualquer um — inclusive de outro gestor (o sistema só impede zerar todos os gestores de uma vez, pra ninguém ficar trancado pra fora sem querer).
- **Recrutador**: pode cadastrar novos colaboradores (pra ajudar no levantamento) e aprovar pedidos de acesso de colaboradores, mas **não pode excluir/revogar acesso de ninguém** nem promover alguém a gestor ou recrutador.
- **Colaborador**: faz o levantamento de bens (escanear, cadastrar, ver relatórios) normalmente.

Toda conta nova — seja criada na tela de "Criar conta" ou cadastrada por um recrutador/gestor — só ganha acesso de verdade depois de aprovada. Contas criadas direto por um gestor/recrutador já entram aprovadas.

**Se alguém perder a senha:** na tela de login tem "Esqueci minha senha", que manda um link por e-mail pra criar uma senha nova. Isso vale pra qualquer papel, inclusive gestor — não precisa de mim nem de acesso ao banco pra recuperar.

**Trocar senha ou nome exibido:** cada pessoa faz isso sozinha em Configurações → Minha conta, já logada.

## Leitura automática de etiquetas antigas

Placas antigas de patrimônio (sem QR Code, só com o número gravado/impresso) agora também funcionam: ao tirar a foto da etiqueta, o site tenta ler o número automaticamente direto da imagem e já busca os dados no sistema do governo, do mesmo jeito que faz com um QR Code. Se não conseguir ler (etiqueta apagada, foto ruim etc.), é só digitar o número manualmente — nada trava.

A busca no sistema do governo aceita tanto o tombamento **atual** quanto um **antigo**. E mesmo que o número não seja encontrado lá, o item pode ser salvo normalmente no Escaneia Patrimônio com esse número.

## Duplicados e tombamentos sem registro

- Ao digitar ou escanear um número de patrimônio que **já foi cadastrado antes**, o sistema avisa na hora, mostrando quem cadastrou, onde e quando — com a opção de **atualizar o registro existente** (por exemplo, se o item mudou de sala) em vez de criar um cadastro duplicado.
- Se o tombamento **não for encontrado** no sistema do governo, o site avisa claramente ("não encontramos esse tombamento...").
- Se o bem tiver um **tombamento antigo** registrado, ou estiver marcado como **disponível para baixa** (pode estar desativado), o site mostra esse aviso destacado junto dos dados.

## Ficha em PDF no Google Drive e compartilhamento

O levantamento agora pede a foto da etiqueta do tombamento e **uma ou mais fotos do bem** (dá pra tirar quantas quiser, de ângulos diferentes, e remover alguma antes de salvar). Ao clicar em **Salvar item**, o site monta automaticamente uma ficha em PDF — uma página por foto do item, uma da etiqueta, e uma última página com todos os dados do registro (inclusive os do sistema do governo, quando encontrados) — e sobe esse PDF pra pasta do local no Google Drive da equipe. É o mesmo formato que você já vinha guardando manualmente lá.

Depois de salvar, aparece um botão **"Compartilhar ficha no WhatsApp"**: no celular, ele abre a tela de compartilhamento normal do Android/iPhone com o PDF pronto pra enviar — o WhatsApp aparece como uma das opções, e você escolhe o grupo ou pessoa na hora. Não existe um jeito de mandar automaticamente pra um grupo específico sem essa escolha manual (o WhatsApp não permite isso de fora do próprio app), mas o compartilhamento fica a um toque de distância. No computador, o botão abre o WhatsApp Web com uma mensagem pronta e o link do PDF.

O passo a passo pra ligar o Google Drive está no arquivo `GUIA-GOOGLE-DRIVE.md`.

Nos Relatórios, cada item tem um link **"Ver PDF"** que abre a ficha completa direto no Drive.

## Planilha de regularização (igual a que você já usava)

Na tela **Relatórios**, o botão **"Exportar planilha (XLSX)"** gera um arquivo Excel no mesmo formato da sua planilha "Regularização e Disponibilização de bens para remanejo": DESCRIÇÃO, TOMBAMENTO, AMBIENTE, FOTO DO BEM (com a foto do item já dentro da célula, puxada do Google Drive), ONDE O TOMBAMENTO ESTÁ NO E-ESTADO, NOVO TOMBAMENTO, ESCOLA INTERESSADA, NOME DO GESTOR DA ESCOLA INTERESSADA e OBSERVAÇÃO.

Duas coisas pra entender:

- **"AMBIENTE" x "ONDE O TOMBAMENTO ESTÁ NO E-ESTADO"** são colunas diferentes de propósito: AMBIENTE é o local que você escolheu no levantamento (onde encontrou o bem de verdade); a outra é o campo "Departamento" que vem do sistema do governo (onde o bem está registrado oficialmente lá). Às vezes são o mesmo lugar, às vezes não — por isso na tela de Levantamento, quando os dados do governo aparecem, tem um link **"Usar como local do levantamento"** ao lado do Departamento, caso você queira que os dois batam.
- **NOVO TOMBAMENTO, ESCOLA INTERESSADA e NOME DO GESTOR DA ESCOLA INTERESSADA** ficam em branco na planilha gerada — são informações que só surgem depois, na hora de negociar o remanejo, então continuam sendo preenchidas por você mesmo direto na planilha baixada, do jeito que já fazia.
- **Tombamentos cadastrados mais de uma vez** aparecem com a linha inteira destacada em laranja (na planilha e também na tabela da tela de Relatórios), com um aviso já escrito na coluna OBSERVAÇÃO.

O filtro de local e a busca da tela de Relatórios valem também pra planilha exportada (exporta só o que está sendo mostrado na tela).

## Identificar o item automaticamente pela foto

Ao tirar a primeira foto do bem (não a da etiqueta), o sistema pode sugerir sozinho a descrição — tipo "Mesa de escritório" ou "Cadeira giratória" — do mesmo jeito que dá pra fazer subindo a foto no Google/Gemini. É opcional e gratuito de configurar: o passo a passo está em `GUIA-IDENTIFICACAO-FOTO.md`. Sem configurar, o cadastro funciona normal, só sem essa sugestão automática.

## O que muda em relação ao site antigo

- Agora **precisa de internet** pra usar (antes funcionava offline e sincronizava depois).
- Tem **login com permissões** — cada pessoa entra com seu e-mail, com um papel definido, e o sistema mostra quem cadastrou cada item.
- Ganhou as telas de **Painel geral**, **Relatórios** (com exportar em CSV), **Usuários** (com gestão de acesso) e **Configurações** (locais + conta).
- As fotos agora viram uma ficha em PDF por item, salva direto no Google Drive da equipe, com opção de compartilhar no WhatsApp — em vez de ficarem só dentro do banco de dados.
- O site antigo (GitHub Pages) continua no ar do jeito que estava, caso você queira manter os dois por enquanto.
