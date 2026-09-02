'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseCodigo, formatPatrimonio, onlyDigits, patKey, linkDoSistema } from '@/lib/patrimonio';
import type { SistemaDados } from '@/lib/govLookup';
import { comprimirImagem } from '@/lib/imagem';
import { gerarFichaPdf } from '@/lib/gerarFichaPdf';

interface RegistroExistente {
  id: string;
  local: string;
  criado_por_nome: string | null;
  criado_em: string;
  descricao: string | null;
}

export default function LevantamentoClient({
  salasIniciais,
  nomeUsuario
}: {
  salasIniciais: string[];
  nomeUsuario: string;
}) {
  const supabase = createClient();

  const [salas, setSalas] = useState<string[]>(salasIniciais);
  const [escaneando, setEscaneando] = useState(false);
  const [patrimonio, setPatrimonio] = useState('');
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState(salasIniciais[0] || '');
  const [novaSala, setNovaSala] = useState('');
  const [mostrarNovaSala, setMostrarNovaSala] = useState(false);
  const [tipoCodigo, setTipoCodigo] = useState('Manual');
  const [buscando, setBuscando] = useState(false);
  const [dadosGoverno, setDadosGoverno] = useState<SistemaDados | null>(null);
  const [erroGoverno, setErroGoverno] = useState('');
  const [fotoTombo, setFotoTombo] = useState<File | null>(null);
  const [fotoTomboPreview, setFotoTomboPreview] = useState('');
  const [fotosItem, setFotosItem] = useState<File[]>([]);
  const [fotosItemPreview, setFotosItemPreview] = useState<string[]>([]);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [lendoEtiqueta, setLendoEtiqueta] = useState(false);
  const [mensagemLeitura, setMensagemLeitura] = useState('');
  const [identificandoItem, setIdentificandoItem] = useState(false);
  const [mensagemIdentificacao, setMensagemIdentificacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [duplicado, setDuplicado] = useState<RegistroExistente | null>(null);
  const [verificandoDuplicado, setVerificandoDuplicado] = useState(false);
  const [permitirDuplicado, setPermitirDuplicado] = useState(false);
  const [ultimoPdf, setUltimoPdf] = useState<{ blob: Blob; link: string; resumo: string; nomeArquivo: string } | null>(null);

  const scannerRef = useRef<any>(null);
  const readerId = 'reader';

  useEffect(() => {
    return () => {
      pararCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciarCamera() {
    setMensagem(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const instancia = new Html5Qrcode(readerId);
      scannerRef.current = instancia;
      setEscaneando(true);
      await instancia.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 180 } },
        (decodedText: string, result: any) => {
          const formatName = result?.result?.format?.formatName || 'QR_CODE';
          aplicarCodigoLido(decodedText, formatName);
          pararCamera();
        },
        () => {
          /* ignora frames sem leitura */
        }
      );
    } catch (e) {
      setEscaneando(false);
      setMensagem({ tipo: 'erro', texto: 'Não foi possível abrir a câmera. Você pode digitar o número manualmente.' });
    }
  }

  async function pararCamera() {
    const instancia = scannerRef.current;
    if (instancia) {
      try {
        await instancia.stop();
        instancia.clear();
      } catch {
        /* já parado */
      }
      scannerRef.current = null;
    }
    setEscaneando(false);
  }

  function aplicarCodigoLido(raw: string, formatName: string) {
    const parsed = parseCodigo(raw, formatName);
    setTipoCodigo(parsed.tipo);
    if (parsed.patrimonio) setPatrimonio(parsed.patrimonio);
    if (parsed.descricaoSugerida && !descricao) setDescricao(parsed.descricaoSugerida);
    const numero = parsed.patrimonio || onlyDigits(raw);
    if (numero) {
      buscarNoGoverno(numero);
      checarDuplicado(numero);
    }
  }

  function onPatrimonioChange(v: string) {
    setPatrimonio(formatPatrimonio(v));
    setDuplicado(null);
    setPermitirDuplicado(false);
  }

  async function checarDuplicado(numeroOverride?: string) {
    const numero = numeroOverride || patrimonio;
    if (!numero) return null;
    setVerificandoDuplicado(true);
    const { data } = await supabase
      .from('patrimonio_registros')
      .select('id, local, criado_por_nome, criado_em, descricao')
      .eq('patrimonio_key', patKey(numero))
      .maybeSingle();
    setVerificandoDuplicado(false);
    setDuplicado(data || null);
    return data || null;
  }

  async function atualizarExistente() {
    if (!duplicado) return;
    setSalvando(true);
    setMensagem(null);
    setUltimoPdf(null);
    try {
      const atualizacoes: Record<string, any> = {
        local,
        descricao: descricao || duplicado.descricao,
        criado_por_nome: nomeUsuario,
        atualizado_em: new Date().toISOString(),
        departamento_governo: dadosGoverno?.departamento || null
      };

      if (fotoTombo || fotosItem.length) {
        const resultado = await gerarEEnviarFicha();
        atualizacoes.documento_pdf_url = resultado.link;
        if (resultado.fotoItemDriveId) atualizacoes.foto_item_drive_id = resultado.fotoItemDriveId;
      }

      const { error } = await supabase.from('patrimonio_registros').update(atualizacoes).eq('id', duplicado.id);
      if (error) throw error;

      setMensagem({ tipo: 'ok', texto: `Registro do patrimônio ${patrimonio} atualizado!` });
      limparFormulario();
      setDuplicado(null);
      setPermitirDuplicado(false);
    } catch (e: any) {
      setEnviandoFotos(false);
      setMensagem({ tipo: 'erro', texto: 'Não foi possível atualizar. ' + (e?.message || '') });
    } finally {
      setSalvando(false);
    }
  }

  async function buscarNoGoverno(numeroOverride?: string) {
    const numero = numeroOverride || patrimonio;
    if (!numero) {
      setErroGoverno('Digite ou escaneie o número do patrimônio primeiro.');
      return;
    }
    setBuscando(true);
    setErroGoverno('');
    setDadosGoverno(null);
    try {
      const link = linkDoSistema(numero);
      const resp = await fetch(`/api/gov-lookup?url=${encodeURIComponent(link)}`);
      const json = await resp.json();
      if (json.error) {
        setErroGoverno(json.detail || 'Não encontramos esse patrimônio no sistema do governo.');
      } else {
        setDadosGoverno(json.data);
        if (json.data?.descricao && !descricao) setDescricao(json.data.descricao);
      }
    } catch {
      setErroGoverno('Falha ao buscar os dados do governo. Verifique sua internet.');
    } finally {
      setBuscando(false);
    }
  }

  function onFotoTomboSelecionada(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setFotoTombo(arquivo);
    setFotoTomboPreview(URL.createObjectURL(arquivo));
    // Se a etiqueta não tem QR Code/código de barras (placas antigas, por
    // exemplo), tenta ler o número impresso automaticamente na foto.
    if (!patrimonio) lerNumeroDaEtiqueta(arquivo);
  }

  /** Lê o número de patrimônio direto da foto da etiqueta, usando
   *  reconhecimento de texto (OCR) no navegador — útil pra placas antigas
   *  sem QR Code, que só têm o número impresso/gravado. */
  async function lerNumeroDaEtiqueta(arquivo: File) {
    setLendoEtiqueta(true);
    setMensagemLeitura('Lendo o número da etiqueta…');
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const {
        data: { text }
      } = await worker.recognize(arquivo);
      await worker.terminate();

      const parsed = parseCodigo((text || '').replace(/\s+/g, ''), 'OCR');
      if (parsed.patrimonio) {
        setTipoCodigo('Foto (leitura automática)');
        setPatrimonio(parsed.patrimonio);
        setMensagemLeitura(`Número lido automaticamente: ${parsed.patrimonio}. Confira se está certo antes de salvar.`);
        buscarNoGoverno(parsed.patrimonio);
        checarDuplicado(parsed.patrimonio);
      } else {
        setMensagemLeitura('Não conseguimos ler o número automaticamente nessa foto. Digite o número manualmente abaixo.');
      }
    } catch {
      setMensagemLeitura('Não foi possível ler a etiqueta automaticamente. Digite o número manualmente.');
    } finally {
      setLendoEtiqueta(false);
    }
  }

  function onFotoItemSelecionada(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    const eraPrimeiraFoto = fotosItem.length === 0;
    setFotosItem((prev) => [...prev, arquivo]);
    setFotosItemPreview((prev) => [...prev, URL.createObjectURL(arquivo)]);
    // limpa o input pra poder escolher/tirar outra foto em seguida
    e.target.value = '';
    // Na primeira foto do item, tenta identificar automaticamente o que é
    // (tipo "Mesa de escritório"), igual você faz procurando no Google —
    // só sugere se ainda não tiver descrição digitada.
    if (eraPrimeiraFoto && !descricao) identificarItemPelaFoto(arquivo);
  }

  /** Manda a foto do item pra uma IA de visão identificar o tipo do
   *  objeto (mesa, cadeira, ventilador etc.) e preenche a Descrição
   *  automaticamente. Se não conseguir (sem chave configurada, sem
   *  internet, foto ruim etc.), simplesmente não sugere nada — nunca
   *  trava o cadastro nem esconde o campo pra digitar manualmente. */
  async function identificarItemPelaFoto(arquivo: File) {
    setIdentificandoItem(true);
    setMensagemIdentificacao('Identificando o item na foto…');
    try {
      const comprimida = await comprimirImagem(arquivo, 900, 0.75);
      const form = new FormData();
      form.append('arquivo', comprimida, 'item.jpg');
      const resp = await fetch('/api/identificar-item', { method: 'POST', body: form });
      const json = await resp.json();
      if (resp.ok && json.descricaoSugerida) {
        setDescricao((atual) => atual || json.descricaoSugerida);
        setMensagemIdentificacao(`Sugestão automática pela foto: "${json.descricaoSugerida}". Confira e ajuste se precisar.`);
      } else {
        setMensagemIdentificacao('');
      }
    } catch {
      setMensagemIdentificacao('');
    } finally {
      setIdentificandoItem(false);
    }
  }

  function removerFotoItem(indice: number) {
    setFotosItem((prev) => prev.filter((_, i) => i !== indice));
    setFotosItemPreview((prev) => prev.filter((_, i) => i !== indice));
  }

  /** Envia um arquivo (ficha em PDF ou uma foto solta) pro Google Drive,
   *  na pasta do local informado, e devolve o link e o id do arquivo. */
  async function enviarArquivoDrive(arquivo: Blob, nomeArquivo: string): Promise<{ link: string; id: string }> {
    const form = new FormData();
    form.append('arquivo', arquivo, nomeArquivo);
    form.append('local', local);
    form.append('nomeArquivo', nomeArquivo);

    const resp = await fetch('/api/drive/upload', { method: 'POST', body: form });
    const json = await resp.json();
    if (!resp.ok || json.error) throw new Error(json.error || 'Falha ao enviar pro Drive.');
    return { link: json.link as string, id: json.id as string };
  }

  /** Monta a ficha em PDF (fotos + dados do registro) e sobe pro Drive.
   *  Também sobe a primeira foto do bem solta (além de já entrar no PDF),
   *  pra poder aparecer dentro da planilha exportada depois. Devolve o
   *  link da ficha, o id da foto solta, o próprio PDF (pra poder
   *  compartilhar depois) e um resumo em texto pronto pro WhatsApp. */
  async function gerarEEnviarFicha() {
    setEnviandoFotos(true);
    try {
      const fotosComprimidas = await Promise.all(fotosItem.map((f) => comprimirImagem(f)));
      const fotoTomboComprimida = fotoTombo ? await comprimirImagem(fotoTombo) : null;

      const pdfBlob = await gerarFichaPdf(fotosComprimidas, fotoTomboComprimida, {
        patrimonio,
        descricao,
        local,
        tipoCodigo,
        criadoPor: nomeUsuario,
        linkSistema: linkDoSistema(patrimonio),
        dadosGoverno
      });

      const nomeArquivo = `${patKey(patrimonio)} - ${descricao || 'item'}.pdf`;
      const ficha = await enviarArquivoDrive(pdfBlob, nomeArquivo);

      let fotoItemDriveId: string | null = null;
      if (fotosComprimidas[0]) {
        try {
          const fotoEnviada = await enviarArquivoDrive(fotosComprimidas[0], `${patKey(patrimonio)} - foto.jpg`);
          fotoItemDriveId = fotoEnviada.id;
        } catch {
          // se essa foto solta falhar, a ficha em PDF já tem a foto — não trava o cadastro
        }
      }

      const resumo = `Escaneia Patrimônio\nPatrimônio: ${patrimonio}\nDescrição: ${descricao || '-'}\nLocal: ${local}\nCadastrado por: ${nomeUsuario}\nFicha (PDF): ${ficha.link}`;
      setUltimoPdf({ blob: pdfBlob, link: ficha.link, resumo, nomeArquivo });

      return { link: ficha.link, fotoItemDriveId, blob: pdfBlob, resumo };
    } finally {
      setEnviandoFotos(false);
    }
  }

  /** Abre o compartilhamento do celular (WhatsApp aparece como opção,
   *  inclusive pra grupos) com a ficha em PDF anexada. Não existe um
   *  jeito de mandar direto pra um grupo específico sem interação —
   *  isso a pessoa escolhe na hora. */
  async function compartilharNoWhatsapp() {
    if (!ultimoPdf) return;
    const arquivo = new File([ultimoPdf.blob], ultimoPdf.nomeArquivo, { type: 'application/pdf' });

    if (typeof navigator !== 'undefined' && (navigator as any).canShare?.({ files: [arquivo] })) {
      try {
        await (navigator as any).share({ files: [arquivo], title: 'Escaneia Patrimônio', text: ultimoPdf.resumo });
        return;
      } catch {
        /* usuário cancelou o compartilhamento — sem problema */
        return;
      }
    }

    // Sem suporte a compartilhar arquivo (ex: computador): abre o
    // WhatsApp Web/app com o texto e o link do PDF prontos.
    const url = `https://wa.me/?text=${encodeURIComponent(ultimoPdf.resumo)}`;
    window.open(url, '_blank');
  }

  function definirLocal(nome: string) {
    const limpo = nome.trim();
    if (!limpo) return;
    if (!salas.includes(limpo)) {
      setSalas((prev) => [...prev, limpo].sort());
      supabase.from('patrimonio_salas').insert({ nome: limpo }).then(() => {});
    }
    setLocal(limpo);
  }

  function adicionarSala() {
    if (!novaSala.trim()) return;
    definirLocal(novaSala);
    setNovaSala('');
    setMostrarNovaSala(false);
  }

  /** O campo "Departamento" que vem do sistema do governo é onde o bem
   *  está registrado oficialmente — às vezes é exatamente onde a pessoa
   *  encontrou o item durante o levantamento. Esse botão só preenche o
   *  "Local" com esse valor, pra não precisar digitar de novo; a planilha
   *  exportada guarda os dois separados (local do levantamento e local no
   *  governo), então usar isso aqui não perde informação nenhuma. */
  function usarDepartamentoComoLocal() {
    if (!dadosGoverno?.departamento) return;
    definirLocal(dadosGoverno.departamento);
  }

  function limparFormulario() {
    setPatrimonio('');
    setDescricao('');
    setTipoCodigo('Manual');
    setDadosGoverno(null);
    setErroGoverno('');
    setFotoTombo(null);
    setFotoTomboPreview('');
    setFotosItem([]);
    setFotosItemPreview([]);
    setMensagemLeitura('');
    setMensagemIdentificacao('');
    setDuplicado(null);
    setPermitirDuplicado(false);
  }

  async function salvar() {
    if (!patrimonio) {
      setMensagem({ tipo: 'erro', texto: 'Informe o número do patrimônio.' });
      return;
    }
    if (!local) {
      setMensagem({ tipo: 'erro', texto: 'Selecione o local.' });
      return;
    }
    if (!permitirDuplicado) {
      const existente = await checarDuplicado(patrimonio);
      if (existente) return; // mostra o aviso de duplicado em vez de salvar
    }
    setSalvando(true);
    setMensagem(null);
    setUltimoPdf(null);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      let documentoPdfUrl: string | null = null;
      let fotoItemDriveId: string | null = null;
      if (fotoTombo || fotosItem.length) {
        const resultado = await gerarEEnviarFicha();
        documentoPdfUrl = resultado.link;
        fotoItemDriveId = resultado.fotoItemDriveId;
      }

      const registro = {
        tipo: tipoCodigo,
        patrimonio,
        patrimonio_key: patKey(patrimonio),
        descricao,
        local,
        link: linkDoSistema(patrimonio),
        dispositivo: 'Site (Escaneia Patrimônio)',
        documento_pdf_url: documentoPdfUrl,
        foto_item_drive_id: fotoItemDriveId,
        departamento_governo: dadosGoverno?.departamento || null,
        user_id: user?.id || null,
        criado_por_nome: nomeUsuario
      };

      const { error } = await supabase.from('patrimonio_registros').insert(registro);
      if (error) throw error;

      setMensagem({ tipo: 'ok', texto: `Patrimônio ${patrimonio} salvo com sucesso!` });
      limparFormulario();
    } catch (e: any) {
      setEnviandoFotos(false);
      setMensagem({ tipo: 'erro', texto: 'Não foi possível salvar. ' + (e?.message || '') });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-16">
      <div>
        <h1 className="font-display font-bold text-2xl">Levantamento de bens</h1>
        <p className="text-sm text-muted mt-1">Escaneie o código do bem ou digite o número do patrimônio.</p>
      </div>

      {mensagem && (
        <div
          className={`rounded-md2 px-4 py-3 text-sm font-semibold flex items-center justify-between gap-3 flex-wrap ${
            mensagem.tipo === 'ok' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'
          }`}
        >
          <span>{mensagem.texto}</span>
          {mensagem.tipo === 'ok' && ultimoPdf && (
            <button
              onClick={compartilharNoWhatsapp}
              className="rounded-full bg-ok text-white font-semibold px-4 py-1.5 text-xs whitespace-nowrap"
            >
              Compartilhar ficha no WhatsApp
            </button>
          )}
        </div>
      )}

      <div className="bg-surface rounded-lg2 border border-border p-5">
        <h2 className="font-display font-bold text-base mb-3">1. Código do bem</h2>

        {escaneando ? (
          <div className="flex flex-col gap-3">
            <div id={readerId} className="w-full rounded-md2 overflow-hidden bg-black aspect-video" />
            <button
              onClick={pararCamera}
              className="w-full rounded-full border border-border py-2.5 text-sm font-semibold hover:bg-surface-2"
            >
              Cancelar câmera
            </button>
          </div>
        ) : (
          <button
            onClick={iniciarCamera}
            className="w-full rounded-full bg-accent text-white font-semibold py-2.5 text-sm mb-3"
          >
            Abrir câmera e escanear
          </button>
        )}

        <div className="mt-3">
          <label className="text-xs font-semibold text-muted">Número do patrimônio</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              inputMode="numeric"
              value={patrimonio}
              onChange={(e) => onPatrimonioChange(e.target.value)}
              onBlur={() => patrimonio && checarDuplicado(patrimonio)}
              placeholder="000.000.000"
              className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent font-mono"
            />
            <button
              onClick={() => buscarNoGoverno()}
              disabled={buscando}
              className="rounded-md2 border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50 whitespace-nowrap"
            >
              {buscando ? 'Buscando…' : 'Buscar dados'}
            </button>
          </div>
          {verificandoDuplicado && <p className="text-xs text-muted mt-1">Verificando se esse patrimônio já foi cadastrado…</p>}
          {erroGoverno && (
            <p className="text-xs text-danger mt-1">
              {erroGoverno} Você pode digitar tanto o tombamento atual quanto um antigo — a busca funciona com os
              dois. Se mesmo assim não encontrar, ainda dá pra salvar o item normalmente com esse número.
            </p>
          )}
        </div>
      </div>

      {duplicado && !permitirDuplicado && (
        <div className="bg-warn/10 border border-warn/30 rounded-lg2 p-5">
          <h2 className="font-display font-bold text-base text-warn mb-1">⚠ Este patrimônio já foi registrado</h2>
          <p className="text-sm text-muted mb-3">
            Cadastrado em <strong>{duplicado.local || 'local não informado'}</strong>
            {duplicado.criado_por_nome && (
              <>
                {' '}por <strong>{duplicado.criado_por_nome}</strong>
              </>
            )}{' '}
            em {formatarDataHora(duplicado.criado_em)}
            {duplicado.descricao && <> — {duplicado.descricao}</>}.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={atualizarExistente}
              disabled={salvando}
              className="rounded-full bg-accent text-white font-semibold px-4 py-2 text-sm disabled:opacity-50"
            >
              {salvando ? 'Atualizando…' : 'Atualizar registro existente'}
            </button>
            <button
              onClick={() => setPermitirDuplicado(true)}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              Cadastrar mesmo assim como novo
            </button>
          </div>
        </div>
      )}

      {dadosGoverno && (
        <div className="bg-surface rounded-lg2 border border-border p-5">
          <h2 className="font-display font-bold text-base mb-3">Dados encontrados no sistema do governo</h2>

          {dadosGoverno.tombamentoAntigo && (
            <p className="text-xs bg-surface-2 rounded-md2 px-3 py-2 mb-3">
              ℹ Este bem tem um tombamento antigo associado: <strong>{dadosGoverno.tombamentoAntigo}</strong>.
              {dadosGoverno.tombamento && <> O tombamento atual é <strong>{dadosGoverno.tombamento}</strong>.</>}
            </p>
          )}
          {dadosGoverno.disponivelBaixa && /sim/i.test(dadosGoverno.disponivelBaixa) && (
            <p className="text-xs text-warn bg-warn/10 rounded-md2 px-3 py-2 mb-3">
              ⚠ Este bem está marcado como <strong>disponível para baixa</strong> no sistema do governo — pode estar
              desativado ou obsoleto.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {Object.entries(dadosGoverno)
              .filter(([k]) => k !== 'descricao')
              .map(([k, v]) => (
                <div key={k} className="col-span-2 sm:col-span-1">
                  <dt className="text-xs text-muted uppercase tracking-wide">{rotuloCampo(k)}</dt>
                  <dd className="font-semibold break-words">{String(v)}</dd>
                  {k === 'departamento' && String(v).trim().toLowerCase() !== local.trim().toLowerCase() && (
                    <button
                      onClick={usarDepartamentoComoLocal}
                      className="mt-1 text-xs font-semibold text-accent-strong hover:underline"
                    >
                      Usar como local do levantamento →
                    </button>
                  )}
                </div>
              ))}
          </dl>
          {dadosGoverno.departamento && (
            <p className="text-xs text-muted mt-3">
              "Departamento" é onde esse bem está registrado no sistema do governo — pode ser diferente de onde você
              encontrou o item agora. O "Local" abaixo é sempre o que vale pro levantamento; os dois ficam guardados
              separados na planilha.
            </p>
          )}
        </div>
      )}

      <div className="bg-surface rounded-lg2 border border-border p-5 flex flex-col gap-3">
        <h2 className="font-display font-bold text-base">2. Detalhes</h2>

        <div>
          <label className="text-xs font-semibold text-muted">Descrição</label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Cadeira giratória"
            className="mt-1 w-full rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted">Local</label>
          {!mostrarNovaSala ? (
            <div className="flex gap-2 mt-1">
              <select
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-surface"
              >
                {salas.length === 0 && <option value="">Nenhuma sala cadastrada</option>}
                {salas.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setMostrarNovaSala(true)}
                className="rounded-md2 border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-2 whitespace-nowrap"
              >
                + Novo local
              </button>
            </div>
          ) : (
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={novaSala}
                onChange={(e) => setNovaSala(e.target.value)}
                placeholder="Nome do novo local"
                className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                onClick={adicionarSala}
                className="rounded-md2 bg-accent text-white px-3 py-2 text-sm font-semibold whitespace-nowrap"
              >
                Adicionar
              </button>
              <button
                onClick={() => setMostrarNovaSala(false)}
                className="rounded-md2 border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-2"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted">Fotos (opcional, mas recomendado)</label>
          <p className="text-xs text-muted mt-0.5 mb-2">
            Tire uma foto da etiqueta do tombamento e uma ou mais fotos do bem inteiro. Ao salvar, todas viram uma
            única ficha em PDF (fotos + dados do registro), que vai pra pasta do local no Google Drive da equipe.
          </p>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              {fotoTomboPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoTomboPreview} alt="Prévia da etiqueta" className="w-16 h-16 rounded-md2 object-cover border border-border" />
              )}
              <label className="rounded-md2 border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 cursor-pointer">
                {fotoTomboPreview ? 'Trocar foto do tombo' : 'Foto do tombo (etiqueta)'}
                <input type="file" accept="image/*" capture="environment" onChange={onFotoTomboSelecionada} className="hidden" />
              </label>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-3">
                {fotosItemPreview.map((src, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Foto do item ${i + 1}`} className="w-16 h-16 rounded-md2 object-cover border border-border" />
                    <button
                      onClick={() => removerFotoItem(i)}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center"
                      aria-label="Remover foto"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <label className="rounded-md2 border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 cursor-pointer">
                  {fotosItemPreview.length ? '+ Outra foto do item' : 'Foto do item (o bem inteiro)'}
                  <input type="file" accept="image/*" capture="environment" onChange={onFotoItemSelecionada} className="hidden" />
                </label>
              </div>
            </div>
          </div>
          {(lendoEtiqueta || mensagemLeitura) && (
            <p className={`text-xs mt-2 ${lendoEtiqueta ? 'text-muted' : 'text-accent-strong'}`}>{mensagemLeitura}</p>
          )}
          {(identificandoItem || mensagemIdentificacao) && (
            <p className={`text-xs mt-2 ${identificandoItem ? 'text-muted' : 'text-accent-strong'}`}>{mensagemIdentificacao}</p>
          )}
          {enviandoFotos && <p className="text-xs text-muted mt-2">Gerando a ficha em PDF e enviando pro Google Drive…</p>}
        </div>
      </div>

      {(!duplicado || permitirDuplicado) && (
        <button
          onClick={salvar}
          disabled={salvando}
          className="w-full rounded-full bg-accent text-white font-semibold py-3 text-sm disabled:opacity-50"
        >
          {enviandoFotos ? 'Gerando ficha em PDF…' : salvando ? 'Salvando…' : 'Salvar item'}
        </button>
      )}
    </div>
  );
}

function formatarDataHora(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function rotuloCampo(k: string): string {
  const mapa: Record<string, string> = {
    tombamento: 'Tombamento',
    tombamentoAntigo: 'Tombamento antigo',
    lote: 'Lote',
    tipo: 'Tipo',
    classificacao: 'Classificação',
    estadoConservacao: 'Estado de conservação',
    disponivelBaixa: 'Disponível para baixa',
    unidade: 'Unidade',
    departamento: 'Departamento',
    responsavel: 'Responsável',
    formaIngresso: 'Forma de ingresso',
    dataEntrada: 'Data de entrada',
    valorAquisicao: 'Valor de aquisição',
    valorResidual: 'Valor residual',
    vidaUtil: 'Vida útil',
    categoria: 'Categoria'
  };
  return mapa[k] || k;
}
