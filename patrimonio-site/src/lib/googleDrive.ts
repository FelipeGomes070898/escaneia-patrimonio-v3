import { google } from 'googleapis';
import { Readable } from 'stream';

/** Envia fotos pro Google Drive da Secretaria, organizadas em uma pasta
 *  por local (sala) dentro da pasta raiz configurada. Usa uma "conta de
 *  serviço" do Google (credenciais só de servidor) — por isso funciona
 *  pra qualquer pessoa da equipe sem cada uma precisar autorizar o
 *  próprio Google Drive. */

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const chaveBruta = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !chaveBruta) {
    throw new Error('Credenciais do Google Drive não configuradas no servidor.');
  }
  // Na Vercel a chave privada costuma vir com "\n" escapado — desfaz isso.
  const chave = chaveBruta.replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key: chave,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
}

function nomeSeguro(nome: string): string {
  return (nome || 'Sem nome').replace(/['"\\]/g, ' ').trim().slice(0, 120);
}

async function encontrarOuCriarPasta(drive: ReturnType<typeof google.drive>, nome: string, paiId: string): Promise<string> {
  const seguro = nomeSeguro(nome).replace(/'/g, "\\'");
  const busca = await drive.files.list({
    q: `name='${seguro}' and '${paiId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });
  const existente = busca.data.files?.[0];
  if (existente?.id) return existente.id;

  const criada = await drive.files.create({
    requestBody: {
      name: nomeSeguro(nome),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [paiId]
    },
    fields: 'id'
  });
  if (!criada.data.id) throw new Error('Não foi possível criar a pasta no Drive.');
  return criada.data.id;
}

export interface EnvioFotoDrive {
  local: string;
  nomeArquivo: string;
  mimeType: string;
  buffer: Buffer;
}

export async function enviarFotoParaDrive({ local, nomeArquivo, mimeType, buffer }: EnvioFotoDrive) {
  const raizId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!raizId) throw new Error('Pasta raiz do Google Drive não configurada no servidor.');

  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  const pastaLocalId = await encontrarOuCriarPasta(drive, local, raizId);

  const criado = await drive.files.create({
    requestBody: { name: nomeSeguro(nomeArquivo), parents: [pastaLocalId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink'
  });

  if (!criado.data.id) throw new Error('Falha ao enviar a foto pro Drive.');

  return {
    id: criado.data.id,
    link: criado.data.webViewLink || `https://drive.google.com/file/d/${criado.data.id}/view`
  };
}

/** Baixa o conteúdo de um arquivo do Drive (usado pra embutir a foto do
 *  bem dentro da planilha exportada). Só funciona pra arquivos que a
 *  própria conta de serviço enviou/tem acesso. */
export async function baixarArquivoDrive(fileId: string): Promise<Buffer> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const resposta = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(resposta.data as ArrayBuffer);
}
