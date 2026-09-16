'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseCodigo, formatPatrimonio, onlyDigits, patKey, linkDoSistema, DESCRICOES_RAPIDAS } from '@/lib/patrimonio';
import type { SistemaDados } from '@/lib/govLookup';
import { comprimirImagem, realcarEtiqueta } from '@/lib/imagem';
import { gerarFichaPdf } from '@/lib/gerarFichaPdf';
import { enviarFotoParaStorage } from '@/lib/supabaseStorage';

interface RegistroExistente {
  id: string;
  local: string;
  escola: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  descricao: string | null;
}

/** Uma linha da planilha oficial importada (ver Configurações → Importar
 *  planilha) — descrição/local/estado já conhecidos oficialmente pra esse
 *  tombo, sem precisar esperar a busca no e-Estado (que às vezes cai). */
interface ItemPlanilha {
  descricao: string | null;
  ambiente: string | null;
  estado_conservacao: string | null;
  classificacao: string | null;
  tombamento_antigo: string | null;
  observacao: string | null;
}

const CHAVE_ESCOLA_ATUAL = 'escaneia_escola_atual';

export default function LevantamentoClient({
  salasIniciais,
  escolasIniciais,
  nomeUsuario
}: {
  salasIniciais: string[];
  escolasIniciais: string[];
  nomeUsuario: string;
}) {
  const supabase = createClient();

  const [salas, setSalas] = useState<string[]>(salasIniciais);
  // Escola/unidade onde o levantamento de hoje está sendo feito — fica
  // salva no aparelho (localStorage), não muda a cada item cadastrado.
  // Assim, quando 6 pessoas saem cada uma pra uma sala diferente da mesma
  // escola, cada celular já mantém a escola certa marcada em todos os
  // itens que essa pessoa registrar, sem precisar escolher de novo toda
  // hora — e na hora de exportar dá pra puxar só os itens dessa escola.
  const [escolas, setEscolas] = useState<string[]>(escolasIniciais);
  const [escola, setEscolaState] = useState('');
  const [novaEscola, setNovaEscola] = useState('');
  const [mostrarNovaEscola, setMostrarNovaEscola] = useState(false);
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
  const [dadosPlanilha, setDadosPlanilha] = useState<ItemPlanilha | null>(null);
  const [fotoTombo, setFotoTombo] = useState<File | null>(null);
  const [fotoTomboPreview, setFotoTomboPreview] = useState('');
  const [fotosItem, setFotosItem] = useState<File[]>([]);
  const [fotosItemPreview, setFotosItemPreview] = useState<string[]>([]);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [lendoEtiqueta, setLendoEtiqueta] = useState(false);
  const [mensagemLeitura, setMensagemLeitura] = useState('');
  const [identificandoItem, setIdentificandoItem] = useState(false);
  const [mensagemIdentificacao, setMensagemIdentificacao] = useState('');
  const [mensagemDescricaoEtiqueta, setMensagemDescricaoEtiqueta] = useState('');
  const [ditando, setDitando] = useState(false);
  const [suportaDitado, setSuportaDitado] = useState(false);
  const reconhecimentoRef = useRef<any>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [duplicado, setDuplicado] = useState<RegistroExistente | null>(null);
  const [verificandoDuplicado, setVerificandoDuplicado] = useState(false);
  const [permitirDuplicado, setPermitirDuplicado] = useState(false);
  const [ultimoPdf, setUltimoPdf] = useState<{ blob: Blob; nomeArquivo: string } | null>(null);
  const [verDadosCompletos, setVerDadosCompletos] = useState(false);

  // Item sem etiqueta/tombo nenhuma (móvel quebrado, etiqueta que caiu
  // etc.) — mesmo assim precisa entrar na planilha, só com as fotos e a
  // descrição, sem número de patrimônio nenhum.
  const [semEtiqueta, setSemEtiqueta] = useState(false);

  // Medidas do item (opcional) — digitadas à mão com uma trena/fita
  // métrica na hora do cadastro. Não tem como medir sozinho pela câmera
  // do celular (isso precisaria de sensor de profundidade, que a maioria
  // dos aparelhos não tem), então o "medidor" aqui é só um jeito rápido
  // de já deixar isso registrado junto com o item, sem precisar de outro
  // sistema/planilha separada depois.
  const [medidaLargura, setMedidaLargura] = useState('');
  const [medidaAltura, setMedidaAltura] = useState('');
  const [medidaProfundidade, setMedidaProfundidade] = useState('');

  // Régua digital: mede pela própria foto do item, tocando dois pontos por
  // vez — pra quando não tem trena à mão. Funciona em duas etapas: primeiro
  // toca nas duas pontas de um objeto de tamanho JÁ CONHECIDO que apareça na
  // foto (folha A4, cartão, ou um tamanho digitado à mão) pra calibrar
  // quantos pixels da imagem valem 1 centímetro; depois toca nas duas
  // pontas do que quer medir (largura, altura, profundidade, ou uma
  // diagonal qualquer) e o sistema calcula a distância real. É sempre uma
  // ESTIMATIVA visual — por isso só preenche os mesmos campos de "Medidas
  // do item" acima, que continuam editáveis à mão, e sempre mostra um
  // aviso deixando isso claro (não é sensor de profundidade, é geometria
  // simples comparando com o objeto de referência).
  const [medindoPelaFoto, setMedindoPelaFoto] = useState(false);
  const [tipoReferencia, setTipoReferencia] = useState<'a4-altura' | 'a4-largura' | 'cartao' | 'manual'>('a4-altura');
  const [tamanhoRefManual, setTamanhoRefManual] = useState('');
  const [pontosCalibracao, setPontosCalibracao] = useState<{ x: number; y: number }[]>([]);
  const [pxPorCm, setPxPorCm] = useState<number | null>(null);
  const [pontosMedidaAtual, setPontosMedidaAtual] = useState<{ x: number; y: number }[]>([]);
  const [rotuloMedidaAtual, setRotuloMedidaAtual] = useState<'Largura' | 'Altura' | 'Profundidade' | 'Diagonal'>('Altura');
  const [medicoesPelaFoto, setMedicoesPelaFoto] = useState<
    { rotulo: string; cm: number; p1: { x: number; y: number }; p2: { x: number; y: number } }[]
  >([]);
  const imgMedicaoRef = useRef<HTMLImageElement>(null);

  const scannerRef = useRef<any>(null);
  const readerId = 'reader';
  const [lanternaDisponivel, setLanternaDisponivel] = useState(false);
  const [lanternaLigada, setLanternaLigada] = useState(false);

  // Foto tirada direto da câmera já aberta (sem passar pelo app de câmera
  // do celular) — fica "pendente" até a pessoa confirmar que ficou nítida
  // ou pedir pra tirar de novo, antes de ela virar de fato a foto da
  // etiqueta/do item.
  const [fotoPendente, setFotoPendente] = useState<{ tipo: 'tombo' | 'item'; file: File; url: string } | null>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSuportaDitado(!!SR);

    // Recupera a escola/unidade que essa pessoa já tinha escolhido nesse
    // aparelho (ver comentário no state "escola" acima).
    try {
      const salva = window.localStorage.getItem(CHAVE_ESCOLA_ATUAL);
      if (salva) setEscolaState(salva);
    } catch {
      /* localStorage bloqueado (aba anônima, etc.) — sem problema, só não lembra */
    }

    // Abre a câmera sozinha assim que a tela carrega, sem precisar tocar
    // em nenhum botão — se o navegador já tiver dado permissão antes
    // (o normal depois do primeiro uso), abre direto; se ainda não deu
    // permissão, o próprio navegador pergunta na hora. Se falhar por
    // qualquer motivo, não mostra erro nenhum aqui (silencioso) — o botão
    // "Abrir câmera" continua disponível pra tentar manualmente.
    iniciarCamera(true);

    return () => {
      pararCamera();
      try {
        reconhecimentoRef.current?.stop();
      } catch {
        /* já parado */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Define a escola/unidade atual desse levantamento — cria na lista
   *  compartilhada se ainda não existir (igual "definirLocal" já faz pras
   *  salas) e lembra no aparelho pros próximos itens. */
  function definirEscola(nome: string) {
    const limpo = nome.trim();
    if (!limpo) return;
    if (!escolas.includes(limpo)) {
      setEscolas((prev) => [...prev, limpo].sort());
      supabase.from('patrimonio_escolas').insert({ nome: limpo }).then(() => {});
    }
    setEscolaState(limpo);
    try {
      window.localStorage.setItem(CHAVE_ESCOLA_ATUAL, limpo);
    } catch {
      /* sem problema, só não vai lembrar na próxima vez que abrir o site */
    }
  }

  function adicionarEscola() {
    if (!novaEscola.trim()) return;
    definirEscola(novaEscola);
    setNovaEscola('');
    setMostrarNovaEscola(false);
  }

  /** Liga/desliga o ditado por voz da Descrição — útil pra digitar menos
   *  no celular, principalmente com uma mão só segurando o item. Usa o
   *  reconhecimento de voz do próprio navegador (não precisa de nenhuma
   *  chave configurada), então só funciona nos navegadores que suportam
   *  isso (Chrome no Android funciona bem; se não suportar, o botão nem
   *  aparece e dá pra digitar normalmente). */
  function alternarDitado() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    if (ditando) {
      reconhecimentoRef.current?.stop();
      return;
    }

    const reconhecimento = new SR();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.interimResults = false;
    reconhecimento.maxAlternatives = 1;

    reconhecimento.onstart = () => setDitando(true);
    reconhecimento.onend = () => setDitando(false);
    reconhecimento.onerror = (e: any) => {
      setDitando(false);
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setMensagem({ tipo: 'erro', texto: 'O navegador bloqueou o microfone. Toque no cadeado ao lado do endereço, libere o microfone e tente de novo.' });
      } else if (e?.error !== 'no-speech' && e?.error !== 'aborted') {
        setMensagem({ tipo: 'erro', texto: 'Não foi possível reconhecer o áudio. Tente de novo ou digite manualmente.' });
      }
    };
    reconhecimento.onresult = (e: any) => {
      const texto = e.results?.[0]?.[0]?.transcript?.trim();
      if (texto) {
        setDescricao((atual) => (atual ? `${atual} ${texto}` : texto));
      }
    };

    reconhecimentoRef.current = reconhecimento;
    reconhecimento.start();
  }

  /** Abre a câmera. Quando `silencioso` é true (usado na abertura
   *  automática da tela), qualquer falha fica quieta — não mostra
   *  mensagem de erro nenhuma, só deixa o botão "Abrir câmera" disponível
   *  pra pessoa tentar manualmente quando quiser. */
  async function iniciarCamera(silencioso = false) {
    if (!silencioso) setMensagem(null);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      const instancia = new Html5Qrcode(readerId, {
        // Só os formatos que aparecem nas etiquetas (QR Code e os
        // códigos de barra usados pelo governo) — checar menos formatos
        // por quadro deixa a leitura mais rápida.
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13
        ],
        // Usa o leitor nativo do próprio Android quando o aparelho tem
        // (bem mais rápido e enxerga o código de mais longe/ângulo do
        // que o leitor em JavaScript usado como alternativa).
        useBarCodeDetectorIfSupported: true,
        verbose: false
      });
      scannerRef.current = instancia;
      setEscaneando(true);
      setLanternaDisponivel(false);
      setLanternaLigada(false);
      await instancia.start(
        // Pede a câmera numa resolução maior — com uma imagem mais nítida,
        // o código é lido de mais longe e mais rápido.
        { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        {
          fps: 15,
          // Sem uma caixinha pequena obrigando a centralizar o código —
          // agora a leitura funciona em qualquer parte da tela, então não
          // precisa mais chegar perto nem alinhar certinho.
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const lado = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.9);
            return { width: lado, height: lado };
          }
        },
        (decodedText: string, result: any) => {
          const formatName = result?.result?.format?.formatName || 'QR_CODE';
          aplicarCodigoLido(decodedText, formatName);
          pararCamera();
        },
        () => {
          /* ignora frames sem leitura */
        }
      );
      // Se o aparelho tiver lanterna, mostra o botão pra ligar — ajuda
      // muito a ler etiquetas em lugar escuro (embaixo de móveis, depósito).
      try {
        const capacidades: any = instancia.getRunningTrackCapabilities?.();
        setLanternaDisponivel(!!capacidades?.torch);
      } catch {
        setLanternaDisponivel(false);
      }
    } catch (e: any) {
      setEscaneando(false);
      if (!silencioso) setMensagem({ tipo: 'erro', texto: mensagemErroCamera(e) });
    }
  }

  /** Pega um quadro da câmera que já está aberta na tela e devolve como
   *  arquivo de foto — sem precisar abrir o app de câmera do celular à
   *  parte. É o que os botões "Fotografar etiqueta"/"Registrar o bem"
   *  usam. Devolve null se a câmera não estiver pronta ainda. */
  async function capturarFrameDaCamera(): Promise<File | null> {
    const video = document.querySelector<HTMLVideoElement>(`#${readerId} video`);
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return null;
    return new File([blob], `captura-${Date.now()}.jpg`, { type: 'image/jpeg' });
  }

  /** Tira a foto (da etiqueta ou do item) direto da câmera aberta e
   *  mostra em tela grande antes de aceitar — dá pra conferir se ficou
   *  nítida/focada e tirar de novo se não ficou, em vez de só descobrir
   *  depois de já ter salvo o item. */
  async function fotografarAoVivo(tipo: 'tombo' | 'item') {
    const arquivo = await capturarFrameDaCamera();
    if (!arquivo) {
      setMensagem({ tipo: 'erro', texto: 'A câmera ainda não está pronta. Espere um instante e tente de novo.' });
      return;
    }
    if (fotoPendente) URL.revokeObjectURL(fotoPendente.url);
    setFotoPendente({ tipo, file: arquivo, url: URL.createObjectURL(arquivo) });
  }

  /** Descarta a foto pendente (a pessoa achou que não ficou boa) — a
   *  câmera continua aberta, é só tocar de novo no botão de fotografar. */
  function tirarFotoDeNovo() {
    if (fotoPendente) URL.revokeObjectURL(fotoPendente.url);
    setFotoPendente(null);
  }

  /** A foto pendente ficou boa — usa ela como foto da etiqueta ou do
   *  item, do mesmo jeito que usaria uma foto tirada pelo app de câmera
   *  do celular. */
  async function usarFotoPendente() {
    if (!fotoPendente) return;
    const { tipo, file, url } = fotoPendente;
    setFotoPendente(null);
    URL.revokeObjectURL(url);
    if (tipo === 'tombo') {
      await usarFotoTombo(file);
    } else {
      await usarFotoItem(file);
    }
  }

  /** Liga/desliga a lanterna do celular durante o escaneamento — só
   *  aparece quando o aparelho tem essa capacidade. */
  async function alternarLanterna() {
    const instancia = scannerRef.current;
    if (!instancia) return;
    try {
      await instancia.applyVideoConstraints({ advanced: [{ torch: !lanternaLigada }] });
      setLanternaLigada((atual) => !atual);
    } catch {
      /* aparelho não deixou — sem problema, o botão só não faz efeito */
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
    setLanternaDisponivel(false);
    setLanternaLigada(false);
  }

  function aplicarCodigoLido(raw: string, formatName: string) {
    const parsed = parseCodigo(raw, formatName);
    setTipoCodigo(parsed.tipo);
    if (parsed.patrimonio) setPatrimonio(parsed.patrimonio);
    if (parsed.descricaoSugerida && !descricao) {
      setDescricao(parsed.descricaoSugerida);
      setMensagemDescricaoEtiqueta(`Descrição preenchida automaticamente pela etiqueta: "${parsed.descricaoSugerida}". Confira e ajuste se precisar.`);
    }
    const numero = parsed.patrimonio || onlyDigits(raw);
    if (numero) {
      buscarNoGoverno(numero);
      checarDuplicado(numero);
      buscarNaPlanilhaImportada(numero);
    }
  }

  function onPatrimonioChange(v: string) {
    setPatrimonio(formatPatrimonio(v));
    setDuplicado(null);
    setPermitirDuplicado(false);
    setDadosPlanilha(null);
  }

  /** Procura o tombo na planilha oficial que já foi importada pra essa
   *  escola (ver Configurações → Importar planilha) — quando acha, mostra
   *  a descrição/local/estado já conhecidos na hora, sem precisar esperar
   *  (ou depender) da busca ao vivo no e-Estado. Só procura se já tiver
   *  uma escola escolhida, já que a planilha é organizada por escola. */
  async function buscarNaPlanilhaImportada(numeroOverride?: string) {
    const numero = numeroOverride || patrimonio;
    if (!numero || !escola) {
      setDadosPlanilha(null);
      return;
    }
    const { data } = await supabase
      .from('patrimonio_planilha_itens')
      .select('descricao, ambiente, estado_conservacao, classificacao, tombamento_antigo, observacao')
      .eq('escola', escola)
      .eq('tombamento_key', patKey(numero))
      .maybeSingle();
    setDadosPlanilha(data || null);
  }

  function usarDescricaoDaPlanilha() {
    if (dadosPlanilha?.descricao) setDescricao(dadosPlanilha.descricao);
  }

  function usarLocalDaPlanilha() {
    if (dadosPlanilha?.ambiente) definirLocal(dadosPlanilha.ambiente);
  }

  async function checarDuplicado(numeroOverride?: string) {
    const numero = numeroOverride || patrimonio;
    if (!numero) return null;
    setVerificandoDuplicado(true);
    const { data } = await supabase
      .from('patrimonio_registros')
      .select('id, local, escola, criado_por_nome, criado_em, descricao')
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

      let pdfBlob: Blob | null = null;
      if (fotoTombo || fotosItem.length) {
        const resultado = await enviarFotosEGerarFicha();
        if (resultado.fotoTomboUrl) atualizacoes.foto_tombo_url = resultado.fotoTomboUrl;
        if (resultado.fotoItemUrl) atualizacoes.foto_item_url = resultado.fotoItemUrl;
        pdfBlob = resultado.pdfBlob;
      }

      const { error } = await supabase.from('patrimonio_registros').update(atualizacoes).eq('id', duplicado.id);
      if (error) throw error;

      if (pdfBlob) {
        const nomeArquivo = `${patKey(patrimonio)} - ${descricao || 'item'}.pdf`;
        setUltimoPdf({ blob: pdfBlob, nomeArquivo });
        // Tenta abrir o compartilhamento sozinho, sem esperar toque no
        // botão — economiza um passo quando o navegador permite. Se não
        // der (ou a pessoa cancelar), o botão "Compartilhar" continua ali
        // pronto pra tentar de novo manualmente.
        tentarCompartilhar({ blob: pdfBlob, nomeArquivo }, resumoParaCompartilhar(nomeArquivo));
      }

      setMensagem({ tipo: 'ok', texto: `Registro do patrimônio ${patrimonio} atualizado!` });
      limparFormulario();
      setDuplicado(null);
      setPermitirDuplicado(false);
    } catch (e: any) {
      setEnviandoFotos(false);
      setMensagem({ tipo: 'erro', texto: 'Não foi possível atualizar. ' + (e?.message || '') });
    } finally {
      setSalvando(false);
      setEnviandoFotos(false);
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

  async function onFotoTomboSelecionada(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    e.target.value = '';
    await usarFotoTombo(arquivo);
  }

  /** Usa um arquivo (vindo do app de câmera do celular ou de uma captura
   *  ao vivo da câmera já aberta na tela) como a foto da etiqueta. */
  async function usarFotoTombo(arquivo: File) {
    // Comprime já na hora de tirar a foto (fotos de celular vêm com vários
    // MB) — segurar várias fotos originais na memória ao mesmo tempo, sem
    // isso, é o que costuma fazer o navegador travar com "insuficiência de
    // memória" em aparelhos mais simples, principalmente depois de
    // cadastrar vários itens seguidos na mesma sessão.
    const comprimida = await comprimirImagem(arquivo);
    if (fotoTomboPreview) URL.revokeObjectURL(fotoTomboPreview);
    setFotoTombo(comprimida);
    setFotoTomboPreview(URL.createObjectURL(comprimida));
    // Se a etiqueta não tem QR Code/código de barras (placas antigas, por
    // exemplo), tenta ler o número impresso automaticamente na foto.
    if (!patrimonio) lerNumeroDaEtiqueta(comprimida);
  }

  /** Lê o número de patrimônio (e a "Desc. analítica"/"Desc. sintética",
   *  se tiver) direto da foto da etiqueta. Dispara DUAS leituras ao mesmo
   *  tempo, em paralelo, em vez de uma depois da outra — assim o tempo de
   *  espera é o da mais lenta das duas, não a soma:
   *  1) OCR (tesseract) no próprio navegador, já em português — não
   *     depende de internet/chave de API.
   *  2) A IA de visão do Google, numa versão da foto com contraste bem
   *     realçado (ver realcarEtiqueta em lib/imagem.ts) — não é uma "luz
   *     ultravioleta" de verdade (câmera de celular não capta isso), mas
   *     esse realce + a IA juntos costumam ler números que o OCR sozinho
   *     não consegue, em etiquetas antigas, apagadas ou riscadas.
   *  No fim, junta o melhor dos dois resultados. Se nenhum achar nada,
   *  pede pra digitar manualmente — nunca trava o cadastro. */
  async function lerNumeroDaEtiqueta(arquivo: File) {
    setLendoEtiqueta(true);
    setMensagemLeitura('Lendo a etiqueta (número e descrição) com OCR e com a IA do Google, ao mesmo tempo…');

    const viaOcr = (async () => {
      let numero = '';
      let descricao = '';
      try {
        const { createWorker } = await import('tesseract.js');
        // "eng+por" lê tanto os dígitos quanto os acentos/palavras em
        // português da etiqueta (ex: "Patrimônio", "Desc. sintética") —
        // com só "eng" a acentuação saía errada com frequência.
        const worker = await createWorker('eng+por');
        const {
          data: { text }
        } = await worker.recognize(arquivo);
        await worker.terminate();

        const textoLido = text || '';
        // Pro número, remove espaços (OCR às vezes separa os dígitos sem
        // querer). Pra descrição, mantém os espaços/linhas — eles são o
        // que ajuda a achar onde o campo começa e termina.
        const parsed = parseCodigo(textoLido.replace(/\s+/g, ''), 'OCR');
        const parsedDescricao = parseCodigo(textoLido, 'OCR');
        if (parsed.patrimonio) numero = parsed.patrimonio;
        if (parsedDescricao.descricaoSugerida) descricao = parsedDescricao.descricaoSugerida;
      } catch {
        /* sem problema — a leitura pela IA continua rodando em paralelo */
      }
      return { numero, descricao };
    })();

    const viaIa = (async () => {
      let numero = '';
      let descricao = '';
      let iaDesligada = false;
      try {
        const realcada = await realcarEtiqueta(arquivo);
        const form = new FormData();
        form.append('arquivo', realcada, 'etiqueta.jpg');
        const resp = await fetch('/api/ler-etiqueta', { method: 'POST', body: form });
        const json = await resp.json();
        if (resp.ok && json.leitura) {
          if (json.leitura.numero) numero = formatPatrimonio(json.leitura.numero);
          if (json.leitura.descricaoAnalitica) {
            descricao = json.leitura.descricaoAnalitica;
          } else if (json.leitura.item) {
            // Sem "Desc. analítica/sintética" na etiqueta — usa o palpite
            // da IA sobre que objeto é (ex: "Mesa para cadeirante") como
            // descrição, já que ela também olhou o enquadramento da foto.
            descricao = json.leitura.item;
          }
        } else if (resp.ok && json.iaConfigurada === false) {
          iaDesligada = true;
        }
      } catch {
        /* sem internet, ou a chamada falhou — segue só com o OCR */
      }
      return { numero, descricao, iaDesligada };
    })();

    const [resultadoOcr, resultadoIa] = await Promise.all([viaOcr, viaIa]);

    // O OCR só devolve um número quando reconhece dígitos de verdade no
    // padrão certo (regex), então quando ele acha algo, é normalmente
    // mais confiável do que um palpite da IA — por isso vem primeiro. A
    // IA entra como reforço, principalmente nas etiquetas apagadas onde
    // o OCR não achou nada.
    const numeroEncontrado = resultadoOcr.numero || resultadoIa.numero;
    const descricaoEncontrada = resultadoOcr.descricao || resultadoIa.descricao;
    const viaIA = !resultadoOcr.numero && !!resultadoIa.numero;

    if (numeroEncontrado) {
      setTipoCodigo(viaIA ? 'Foto (IA do Google)' : 'Foto (leitura automática)');
      setPatrimonio(numeroEncontrado);
      let msg = `Número lido automaticamente${viaIA ? ' pela IA' : ''}: ${numeroEncontrado}. Confira se está certo antes de salvar.`;
      if (descricaoEncontrada && !descricao) {
        setDescricao(descricaoEncontrada);
        msg += ` Descrição também preenchida pela etiqueta: "${descricaoEncontrada}".`;
      }
      setMensagemLeitura(msg);
      buscarNoGoverno(numeroEncontrado);
      checarDuplicado(numeroEncontrado);
      buscarNaPlanilhaImportada(numeroEncontrado);
    } else {
      if (descricaoEncontrada && !descricao) {
        setDescricao(descricaoEncontrada);
        setMensagemLeitura(
          `Não conseguimos ler o número automaticamente nessa foto, mas achamos a descrição "${descricaoEncontrada}" e já preenchemos. Digite o número manualmente abaixo (ou marque "sem etiqueta/tombo" se ela realmente não tiver número legível).`
        );
      } else if (resultadoIa.iaDesligada) {
        setMensagemLeitura(
          'Não conseguimos ler o número automaticamente (e a IA do Google ainda não está configurada nesse site, veja GUIA-IDENTIFICACAO-FOTO.md). Digite o número manualmente abaixo.'
        );
      } else {
        setMensagemLeitura(
          'Não conseguimos ler o número automaticamente nessa foto. Digite manualmente, tente de novo com mais luz/foco, ou marque "Este item não tem etiqueta/tombo" logo abaixo se ela estiver ilegível ou não existir.'
        );
      }
    }
    setLendoEtiqueta(false);
  }

  async function onFotoItemSelecionada(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    // limpa o input pra poder escolher/tirar outra foto em seguida
    e.target.value = '';
    await usarFotoItem(arquivo);
  }

  /** Usa um arquivo (vindo do app de câmera do celular ou de uma captura
   *  ao vivo da câmera já aberta na tela) como (mais) uma foto do item. */
  async function usarFotoItem(arquivo: File) {
    const eraPrimeiraFoto = fotosItem.length === 0;
    // Comprime já ao tirar a foto — ver comentário em usarFotoTombo.
    const comprimida = await comprimirImagem(arquivo);
    setFotosItem((prev) => [...prev, comprimida]);
    setFotosItemPreview((prev) => [...prev, URL.createObjectURL(comprimida)]);
    // Na primeira foto do item, tenta identificar automaticamente o que é
    // (tipo "Mesa de escritório"), igual você faz procurando no Google —
    // só sugere se ainda não tiver descrição digitada.
    if (eraPrimeiraFoto && !descricao) identificarItemPelaFoto(comprimida);
  }

  /** Manda a foto do item pra uma IA de visão identificar o tipo do
   *  objeto (mesa, cadeira, ventilador etc.) e preenche a Descrição
   *  automaticamente. Se não conseguir (sem chave configurada, sem
   *  internet, foto ruim etc.), simplesmente não sugere nada — nunca
   *  trava o cadastro nem esconde o campo pra digitar manualmente. */
  async function identificarItemPelaFoto(arquivo: File) {
    setIdentificandoItem(true);
    setMensagemIdentificacao('Identificando o item na foto com a IA do Google…');
    try {
      const comprimida = await comprimirImagem(arquivo, 900, 0.75);
      const form = new FormData();
      form.append('arquivo', comprimida, 'item.jpg');
      const resp = await fetch('/api/identificar-item', { method: 'POST', body: form });
      const json = await resp.json();
      if (resp.ok && json.descricaoSugerida) {
        setDescricao((atual) => atual || json.descricaoSugerida);
        setMensagemIdentificacao(`Sugestão automática pela foto (Google IA): "${json.descricaoSugerida}". Confira e ajuste se precisar.`);
      } else if (resp.ok && json.iaConfigurada === false) {
        // Não é "a foto não deu pra identificar" — é que ninguém configurou
        // a chave da IA ainda. Avisa isso claramente em vez de ficar calado,
        // pra quem administra o sistema saber exatamente o que falta.
        setMensagemIdentificacao('A identificação automática por IA (Google) ainda não foi configurada nesse site — veja o arquivo GUIA-IDENTIFICACAO-FOTO.md pra ativar. Por enquanto, digite a descrição normalmente.');
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
    setFotosItemPreview((prev) => {
      const removida = prev[indice];
      if (removida) URL.revokeObjectURL(removida);
      return prev.filter((_, i) => i !== indice);
    });
    // A régua digital foi calibrada em cima da foto que acabou de sumir —
    // fecha a ferramenta pra não deixar pontos/medidas de uma foto que não
    // existe mais.
    if (indice === 0) {
      setMedindoPelaFoto(false);
      reiniciarCalibracao();
    }
  }

  /** Tamanho real (em cm) do objeto de referência escolhido pra calibrar a
   *  régua digital — por isso as opções prontas são objetos de tamanho
   *  padronizado (folha A4, cartão/crachá) que dá pra confiar sem precisar
   *  medir de novo; "Digitar tamanho" cobre qualquer outro objeto que já
   *  esteja na foto. */
  function tamanhoDaReferenciaCm(): number | null {
    if (tipoReferencia === 'a4-altura') return 29.7;
    if (tipoReferencia === 'a4-largura') return 21;
    if (tipoReferencia === 'cartao') return 8.56;
    return parseMedida(tamanhoRefManual);
  }

  /** Distância entre dois pontos tocados na foto, em pixels da imagem
   *  ORIGINAL (não do tamanho exibido na tela) — assim não depende do
   *  zoom/tamanho da janela do celular no momento do toque. */
  function distanciaEmPixelsNaturais(p1: { x: number; y: number }, p2: { x: number; y: number }, img: HTMLImageElement) {
    const dx = (p2.x - p1.x) * img.naturalWidth;
    const dy = (p2.y - p1.y) * img.naturalHeight;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Registra um toque na foto: os dois primeiros toques (quando ainda não
   *  tem escala definida) calibram a régua contra o objeto de referência
   *  escolhido; os toques seguintes medem o que a pessoa marcou (largura,
   *  altura, profundidade ou uma diagonal). */
  function tocarNaFotoParaMedir(e: React.MouseEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const ponto = { x, y };

    if (!pxPorCm) {
      const novosPontos = pontosCalibracao.length >= 2 ? [ponto] : [...pontosCalibracao, ponto];
      setPontosCalibracao(novosPontos);
      if (novosPontos.length === 2) {
        const tamanhoCm = tamanhoDaReferenciaCm();
        if (!tamanhoCm) {
          setPontosCalibracao([]);
          return;
        }
        const distPx = distanciaEmPixelsNaturais(novosPontos[0], novosPontos[1], img);
        if (distPx > 0) setPxPorCm(distPx / tamanhoCm);
      }
      return;
    }

    const novosPontosMedida = pontosMedidaAtual.length >= 2 ? [ponto] : [...pontosMedidaAtual, ponto];
    setPontosMedidaAtual(novosPontosMedida);
    if (novosPontosMedida.length === 2) {
      const distPx = distanciaEmPixelsNaturais(novosPontosMedida[0], novosPontosMedida[1], img);
      const cm = distPx / pxPorCm;
      setMedicoesPelaFoto((prev) => {
        if (rotuloMedidaAtual === 'Diagonal') {
          const n = prev.filter((m) => m.rotulo.startsWith('Diagonal')).length + 1;
          return [...prev, { rotulo: `Diagonal ${n}`, cm, p1: novosPontosMedida[0], p2: novosPontosMedida[1] }];
        }
        return [
          ...prev.filter((m) => m.rotulo !== rotuloMedidaAtual),
          { rotulo: rotuloMedidaAtual, cm, p1: novosPontosMedida[0], p2: novosPontosMedida[1] }
        ];
      });
      setPontosMedidaAtual([]);
    }
  }

  function reiniciarCalibracao() {
    setPxPorCm(null);
    setPontosCalibracao([]);
    setPontosMedidaAtual([]);
    setMedicoesPelaFoto([]);
  }

  function removerMedicaoPelaFoto(rotulo: string) {
    setMedicoesPelaFoto((prev) => prev.filter((m) => m.rotulo !== rotulo));
  }

  /** Copia as medidas de largura/altura/profundidade calculadas pela régua
   *  digital pros mesmos campos de texto de "Medidas do item" (que
   *  continuam editáveis à mão depois). Diagonais não têm campo próprio —
   *  ficam só na lista, como conferência. */
  function aplicarMedicoesAosCampos() {
    const largura = medicoesPelaFoto.find((m) => m.rotulo === 'Largura');
    const altura = medicoesPelaFoto.find((m) => m.rotulo === 'Altura');
    const profundidade = medicoesPelaFoto.find((m) => m.rotulo === 'Profundidade');
    if (largura) setMedidaLargura(largura.cm.toFixed(1).replace('.', ','));
    if (altura) setMedidaAltura(altura.cm.toFixed(1).replace('.', ','));
    if (profundidade) setMedidaProfundidade(profundidade.cm.toFixed(1).replace('.', ','));
    setMedindoPelaFoto(false);
  }

  function fecharFerramentaMedicao() {
    setMedindoPelaFoto(false);
    reiniciarCalibracao();
  }

  /** Sobe as fotos (tombo + primeira foto do item) pro Storage do
   *  Supabase — rápido e sem depender de nenhuma credencial externa — e
   *  monta a ficha em PDF inteiramente no navegador (sem subir a lugar
   *  nenhum). O PDF fica só na memória, pronto pra baixar ou compartilhar
   *  no WhatsApp; quem quiser levar pro Google Drive faz isso manualmente
   *  depois, baixando o arquivo. Nada aqui trava o cadastro: se a ficha em
   *  PDF falhar por algum motivo, o registro é salvo do mesmo jeito. */
  async function enviarFotosEGerarFicha(): Promise<{
    fotoTomboUrl: string | null;
    fotoItemUrl: string | null;
    pdfBlob: Blob | null;
  }> {
    setEnviandoFotos(true);
    try {
      // As fotos já foram comprimidas no momento em que foram tiradas (ver
      // onFotoTomboSelecionada/onFotoItemSelecionada) — comprimir de novo
      // aqui era trabalho em dobro e memória em dobro à toa.
      let fotoTomboUrl: string | null = null;
      let fotoItemUrl: string | null = null;

      if (fotoTombo) {
        fotoTomboUrl = await enviarFotoParaStorage(supabase, fotoTombo, `${patKey(patrimonio)}-tombo`);
      }
      if (fotosItem[0]) {
        fotoItemUrl = await enviarFotoParaStorage(supabase, fotosItem[0], `${patKey(patrimonio)}-item`);
      }

      let pdfBlob: Blob | null = null;
      try {
        pdfBlob = await gerarFichaPdf(fotosItem, fotoTombo, {
          patrimonio: patrimonio || 'Sem etiqueta',
          descricao,
          local,
          tipoCodigo,
          criadoPor: nomeUsuario,
          linkSistema: patrimonio ? linkDoSistema(patrimonio) : '',
          dadosGoverno,
          medidas: {
            largura: medidaLargura,
            altura: medidaAltura,
            profundidade: medidaProfundidade
          }
        });
      } catch {
        pdfBlob = null; // ficha em PDF é só um extra — nunca impede o cadastro
      }

      return { fotoTomboUrl, fotoItemUrl, pdfBlob };
    } finally {
      setEnviandoFotos(false);
    }
  }

  /** Baixa a ficha em PDF direto no celular/computador — pra depois, se
   *  quiser, arrastar pro Google Drive manualmente. */
  function baixarFichaPdf() {
    if (!ultimoPdf) return;
    const url = URL.createObjectURL(ultimoPdf.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ultimoPdf.nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resumoParaCompartilhar(nomeArquivo: string, patrimonioOverride?: string) {
    return `Escaneia Patrimônio\nPatrimônio: ${patrimonioOverride ?? patrimonio}\nDescrição: ${descricao || '-'}\nLocal: ${local}\nCadastrado por: ${nomeUsuario}\nFicha em anexo: ${nomeArquivo}`;
  }

  /** Tenta abrir a caixa de compartilhamento nativa do celular (WhatsApp
   *  aparece como opção ali, inclusive pra grupos) com a ficha em PDF já
   *  anexada. Devolve true se conseguiu abrir, ou false se o
   *  aparelho/navegador não suporta ou bloqueou — por exemplo, quando é
   *  chamada automaticamente e não sobrou "permissão" de toque recente
   *  suficiente pro navegador liberar. Não existe um jeito de escolher o
   *  grupo/contato sozinho por segurança — isso a pessoa sempre escolhe
   *  na hora, é o próprio WhatsApp/Android que decide essa etapa. */
  async function tentarCompartilhar(pdf: { blob: Blob; nomeArquivo: string }, resumo: string): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const arquivo = new File([pdf.blob], pdf.nomeArquivo, { type: 'application/pdf' });
    if (!(navigator as any).canShare?.({ files: [arquivo] })) return false;
    try {
      await (navigator as any).share({ files: [arquivo], title: 'Escaneia Patrimônio', text: resumo });
      return true;
    } catch {
      return false; // cancelou, ou o navegador bloqueou — sem problema, os botões continuam ali
    }
  }

  /** Botão manual "Compartilhar ficha no WhatsApp" — se o compartilhamento
   *  nativo não rolar (computador, ou navegador sem suporte), cai pro
   *  WhatsApp Web com o texto pronto; nesse caso a pessoa precisa anexar o
   *  PDF baixado à mão, porque link do WhatsApp não aceita anexo. */
  async function compartilharNoWhatsapp() {
    if (!ultimoPdf) return;
    const resumo = resumoParaCompartilhar(ultimoPdf.nomeArquivo);
    const conseguiu = await tentarCompartilhar(ultimoPdf, resumo);
    if (!conseguiu) {
      const url = `https://wa.me/?text=${encodeURIComponent(
        resumo + '\n\n(Baixe a ficha em "Baixar ficha em PDF" e anexe manualmente aqui no WhatsApp.)'
      )}`;
      window.open(url, '_blank');
    }
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
    // Libera a memória das fotos dessa rodada antes de limpar — como você
    // costuma cadastrar vários itens seguidos sem recarregar a página, sem
    // isso as fotos anteriores continuariam ocupando memória escondidas,
    // até o navegador reclamar de "insuficiência de memória".
    if (fotoTomboPreview) URL.revokeObjectURL(fotoTomboPreview);
    fotosItemPreview.forEach((url) => URL.revokeObjectURL(url));
    if (fotoPendente) URL.revokeObjectURL(fotoPendente.url);

    setFotoPendente(null);
    setPatrimonio('');
    setDescricao('');
    setTipoCodigo('Manual');
    setDadosGoverno(null);
    setErroGoverno('');
    setDadosPlanilha(null);
    setFotoTombo(null);
    setFotoTomboPreview('');
    setFotosItem([]);
    setFotosItemPreview([]);
    setMensagemLeitura('');
    setMensagemIdentificacao('');
    setMensagemDescricaoEtiqueta('');
    setDuplicado(null);
    setPermitirDuplicado(false);
    setVerDadosCompletos(false);
    setSemEtiqueta(false);
    setMedidaLargura('');
    setMedidaAltura('');
    setMedidaProfundidade('');
    setMedindoPelaFoto(false);
    reiniciarCalibracao();
  }

  async function salvar() {
    if (!escola) {
      setMensagem({ tipo: 'erro', texto: 'Selecione (ou crie) a escola/unidade deste levantamento antes de salvar — fica marcada em "Escola/unidade" lá em cima.' });
      return;
    }
    if (!semEtiqueta && !patrimonio) {
      setMensagem({
        tipo: 'erro',
        texto: 'Informe o número do patrimônio, ou marque "Este item não tem etiqueta/tombo" logo acima se ele realmente não tiver nenhuma.'
      });
      return;
    }
    if (semEtiqueta && !fotosItem.length) {
      setMensagem({ tipo: 'erro', texto: 'Como o item não tem etiqueta, tire ao menos uma foto dele antes de salvar — é o que vai identificar esse registro.' });
      return;
    }
    if (!local) {
      setMensagem({ tipo: 'erro', texto: 'Selecione o local.' });
      return;
    }
    if (patrimonio && !permitirDuplicado) {
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

      let fotoTomboUrl: string | null = null;
      let fotoItemUrl: string | null = null;
      let pdfBlob: Blob | null = null;
      if (fotoTombo || fotosItem.length) {
        const resultado = await enviarFotosEGerarFicha();
        fotoTomboUrl = resultado.fotoTomboUrl;
        fotoItemUrl = resultado.fotoItemUrl;
        pdfBlob = resultado.pdfBlob;
      }

      // Sem número de patrimônio nenhum (etiqueta ausente/ilegível): gera
      // uma chave própria pra esse registro, só pra sempre ter um jeito
      // de identificar/atualizar a linha depois — nunca fica igual a de
      // outro item sem tombo (então nunca acusa "duplicado" à toa).
      const semNumero = !patrimonio;
      const chaveFinal = semNumero ? `SEM-TOMBO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : patKey(patrimonio);
      const patrimonioFinal = semNumero ? 'Sem etiqueta' : patrimonio;

      const registro = {
        tipo: semEtiqueta && semNumero ? 'Sem etiqueta (só foto)' : tipoCodigo,
        patrimonio: patrimonioFinal,
        patrimonio_key: chaveFinal,
        descricao,
        local,
        escola,
        link: semNumero ? '' : linkDoSistema(patrimonio),
        dispositivo: 'Site (Escaneia Patrimônio)',
        foto_tombo_url: fotoTomboUrl,
        foto_item_url: fotoItemUrl,
        departamento_governo: dadosGoverno?.departamento || null,
        user_id: user?.id || null,
        criado_por_nome: nomeUsuario,
        sem_tombo: semEtiqueta && semNumero,
        medida_largura_cm: parseMedida(medidaLargura),
        medida_altura_cm: parseMedida(medidaAltura),
        medida_profundidade_cm: parseMedida(medidaProfundidade)
      };

      const { error } = await supabase.from('patrimonio_registros').insert(registro);
      if (error) throw error;

      if (pdfBlob) {
        const nomeArquivo = `${chaveFinal} - ${descricao || 'item'}.pdf`;
        setUltimoPdf({ blob: pdfBlob, nomeArquivo });
        // Tenta abrir o compartilhamento sozinho, sem esperar toque no
        // botão — economiza um passo quando o navegador permite. Se não
        // der (ou a pessoa cancelar), o botão "Compartilhar" continua ali
        // pronto pra tentar de novo manualmente.
        tentarCompartilhar({ blob: pdfBlob, nomeArquivo }, resumoParaCompartilhar(nomeArquivo, patrimonioFinal));
      }

      setMensagem({
        tipo: 'ok',
        texto: semNumero ? 'Item sem etiqueta salvo com sucesso (com as fotos)!' : `Patrimônio ${patrimonio} salvo com sucesso!`
      });
      limparFormulario();
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível salvar. ' + (e?.message || '') });
    } finally {
      setSalvando(false);
      setEnviandoFotos(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-16">
      <div>
        <h1 className="font-display font-bold text-2xl">Levantamento de bens</h1>
        <p className="text-sm text-muted mt-1">Escaneie o código do bem ou digite o número do patrimônio.</p>
      </div>

      <div className="bg-surface rounded-lg2 border border-border p-5">
        <h2 className="font-display font-bold text-base mb-1">Escola/unidade deste levantamento</h2>
        <p className="text-xs text-muted mb-3">
          Marque aqui a escola onde vocês estão fazendo o levantamento agora — fica lembrado nesse aparelho pros
          próximos itens, então não precisa escolher de novo a cada bem. Se forem várias pessoas na mesma escola,
          cada uma escolhe aqui no próprio celular; o "Local" logo abaixo é a sala/setor dentro dela.
        </p>
        <div className="flex flex-wrap gap-2">
          {escolas.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => definirEscola(e)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                escola === e ? 'bg-accent text-white border-accent' : 'border-border hover:bg-surface-2'
              }`}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMostrarNovaEscola((v) => !v)}
            className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-2 whitespace-nowrap"
          >
            + Nova escola/unidade
          </button>
        </div>
        {escolas.length === 0 && !mostrarNovaEscola && (
          <p className="text-xs text-muted mt-1">Nenhuma escola cadastrada ainda — toque em "+ Nova escola/unidade".</p>
        )}
        {mostrarNovaEscola && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={novaEscola}
              onChange={(e) => setNovaEscola(e.target.value)}
              placeholder="Nome da escola/unidade"
              className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              autoFocus
            />
            <button
              onClick={adicionarEscola}
              className="rounded-md2 bg-accent text-white px-3 py-2 text-sm font-semibold whitespace-nowrap"
            >
              Adicionar
            </button>
            <button
              onClick={() => setMostrarNovaEscola(false)}
              className="rounded-md2 border border-border px-3 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              Cancelar
            </button>
          </div>
        )}
        {escola && <p className="text-xs text-accent-strong mt-2">Levantando em: <strong>{escola}</strong></p>}
      </div>

      {mensagem && (
        <div
          className={`rounded-md2 px-4 py-3 text-sm font-semibold flex items-center justify-between gap-3 flex-wrap ${
            mensagem.tipo === 'ok' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'
          }`}
        >
          <span>{mensagem.texto}</span>
          {mensagem.tipo === 'ok' && ultimoPdf && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={baixarFichaPdf}
                className="rounded-full border border-ok text-ok font-semibold px-4 py-1.5 text-xs whitespace-nowrap"
              >
                Baixar ficha em PDF
              </button>
              <button
                onClick={compartilharNoWhatsapp}
                className="rounded-full bg-ok text-white font-semibold px-4 py-1.5 text-xs whitespace-nowrap"
              >
                Compartilhar ficha no WhatsApp
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-surface rounded-lg2 border border-border p-5">
        <h2 className="font-display font-bold text-base mb-3">1. Código do bem</h2>

        {/* O elemento do leitor precisa existir no HTML mesmo antes de abrir a
            câmera — a biblioteca do scanner procura por ele assim que é
            chamada, e se ele só aparecesse depois (via if/else) a câmera
            falhava silenciosamente. Por isso ele fica sempre no DOM, só
            escondido com CSS quando não está escaneando. */}
        <div className={escaneando ? 'flex flex-col gap-3' : 'hidden'}>
          {/* A câmera agora já abre sozinha ao entrar nessa tela — não precisa
              mais tocar em nenhum botão pra começar a escanear. A caixa ficou
              um pouco mais alta (formato retrato) pra caber melhor a etiqueta
              e o item inteiro no mesmo enquadramento. */}
          <div id={readerId} className="w-full rounded-md2 overflow-hidden bg-black aspect-[3/4] max-h-[70vh]" />

          {fotoPendente ? (
            <div className="rounded-md2 border border-accent bg-surface-2 p-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted">
                {fotoPendente.tipo === 'tombo' ? 'Foto da etiqueta — ficou nítida?' : 'Foto do item — ficou nítida?'}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoPendente.url} alt="Prévia da foto tirada" className="w-full rounded-md2 object-contain max-h-[50vh] bg-black" />
              <div className="flex gap-2">
                <button
                  onClick={tirarFotoDeNovo}
                  className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold hover:bg-surface-2"
                >
                  Tirar de novo
                </button>
                <button
                  onClick={usarFotoPendente}
                  className="flex-1 rounded-full bg-accent text-white py-2.5 text-sm font-semibold"
                >
                  Usar esta foto
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => fotografarAoVivo('tombo')}
                className="flex-1 rounded-md2 border border-border py-2.5 text-sm font-semibold hover:bg-surface-2 whitespace-nowrap"
              >
                📷 Fotografar etiqueta
              </button>
              <button
                onClick={() => fotografarAoVivo('item')}
                className="flex-1 rounded-full bg-accent text-white py-2.5 text-sm font-semibold whitespace-nowrap"
              >
                📷 Registrar o bem
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            {fotoTomboPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoTomboPreview} alt="Prévia da etiqueta" className="w-12 h-12 rounded-md2 object-cover border border-border flex-shrink-0" />
            )}
            {fotosItemPreview[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotosItemPreview[0]} alt="Prévia do item" className="w-12 h-12 rounded-md2 object-cover border border-border flex-shrink-0" />
            )}
            {(lendoEtiqueta || mensagemLeitura) && (
              <p className={`text-xs flex-1 ${lendoEtiqueta ? 'text-muted' : 'text-accent-strong'}`}>{mensagemLeitura}</p>
            )}
          </div>
          {(identificandoItem || mensagemIdentificacao) && (
            <p className={`text-xs ${identificandoItem ? 'text-muted' : 'text-accent-strong'}`}>{mensagemIdentificacao}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={pararCamera}
              className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold hover:bg-surface-2"
            >
              Fechar câmera
            </button>
            {lanternaDisponivel && (
              <button
                onClick={alternarLanterna}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap ${
                  lanternaLigada ? 'bg-accent text-white' : 'border border-border hover:bg-surface-2'
                }`}
              >
                {lanternaLigada ? '💡 Lanterna ligada' : '💡 Lanterna'}
              </button>
            )}
          </div>
        </div>
        {!escaneando && (
          <>
            <button
              onClick={() => iniciarCamera(false)}
              className="w-full rounded-full bg-accent text-white font-semibold py-2.5 text-sm mb-3"
            >
              Abrir câmera e escanear
            </button>

            <p className="text-xs font-semibold text-muted mb-1.5">
              Tire aqui as duas fotos do bem: a etiqueta do tombo e o item inteiro. Se a etiqueta estiver apagada ou
              ilegível, tentamos ler mesmo assim com a IA do Google.
            </p>
            <div className="flex items-center gap-3">
              {fotoTomboPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoTomboPreview} alt="Prévia da etiqueta" className="w-14 h-14 rounded-md2 object-cover border border-border flex-shrink-0" />
              )}
              <label className="flex-1 rounded-md2 border border-dashed border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-2 cursor-pointer text-center">
                {fotoTomboPreview ? 'Trocar foto da etiqueta' : 'Sem QR Code, ou a câmera não está lendo? Tire uma foto da etiqueta'}
                <input type="file" accept="image/*" capture="environment" onChange={onFotoTomboSelecionada} className="hidden" />
              </label>
            </div>
            {(lendoEtiqueta || mensagemLeitura) && (
              <p className={`text-xs mt-2 ${lendoEtiqueta ? 'text-muted' : 'text-accent-strong'}`}>{mensagemLeitura}</p>
            )}

            <div className="flex items-center gap-3 mt-2">
              {fotosItemPreview[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotosItemPreview[0]} alt="Prévia do item" className="w-14 h-14 rounded-md2 object-cover border border-border flex-shrink-0" />
              )}
              <label className="flex-1 rounded-md2 border border-dashed border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-2 cursor-pointer text-center">
                {fotosItemPreview.length ? `Foto do item OK (${fotosItemPreview.length}) — tirar outra` : 'Tirar foto do item (o bem inteiro), junto com a do tombo'}
                <input type="file" accept="image/*" capture="environment" onChange={onFotoItemSelecionada} className="hidden" />
              </label>
            </div>
            {(identificandoItem || mensagemIdentificacao) && (
              <p className={`text-xs mt-2 ${identificandoItem ? 'text-muted' : 'text-accent-strong'}`}>{mensagemIdentificacao}</p>
            )}

            <button
              type="button"
              onClick={() => setSemEtiqueta((v) => !v)}
              className={`w-full mt-3 rounded-md2 border px-4 py-2.5 text-sm font-semibold ${
                semEtiqueta ? 'bg-accent text-white border-accent' : 'border-border hover:bg-surface-2'
              }`}
            >
              {semEtiqueta ? '☑' : '☐'} Este item não tem etiqueta/tombo nenhuma
            </button>
            {semEtiqueta && (
              <p className="text-xs text-accent-strong mt-1.5">
                Sem problema — com a(s) foto(s) do item já dá pra salvar mesmo sem número de patrimônio, pra esse
                item não ficar de fora da planilha. Ele entra marcado como "sem etiqueta" pra revisar depois.
              </p>
            )}
          </>
        )}

        <div className="mt-3">
          <label className="text-xs font-semibold text-muted">
            Número do patrimônio {semEtiqueta && <span className="font-normal">(deixe em branco se não tiver)</span>}
          </label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              inputMode="numeric"
              value={patrimonio}
              onChange={(e) => onPatrimonioChange(e.target.value)}
              onBlur={() => {
                if (!patrimonio) return;
                checarDuplicado(patrimonio);
                buscarNaPlanilhaImportada(patrimonio);
              }}
              placeholder="000.000.000"
              className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent font-mono"
            />
            <button
              onClick={() => buscarNoGoverno()}
              disabled={buscando || !patrimonio}
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

      {dadosPlanilha && (
        <div className="bg-accent-soft border border-accent/30 rounded-lg2 p-5">
          <h2 className="font-display font-bold text-base text-accent-strong mb-1">
            📋 Encontramos esse tombo na planilha oficial importada
          </h2>
          <dl className="text-sm flex flex-col gap-1 mb-3">
            {dadosPlanilha.descricao && (
              <div>
                <span className="text-muted">Descrição: </span>
                <strong>{dadosPlanilha.descricao}</strong>
              </div>
            )}
            {dadosPlanilha.ambiente && (
              <div>
                <span className="text-muted">Ambiente na planilha: </span>
                <strong>{dadosPlanilha.ambiente}</strong>
              </div>
            )}
            {dadosPlanilha.estado_conservacao && (
              <div>
                <span className="text-muted">Estado de conservação: </span>
                <strong>{dadosPlanilha.estado_conservacao}</strong>
              </div>
            )}
            {dadosPlanilha.classificacao && (
              <div>
                <span className="text-muted">Classificação: </span>
                <strong>{dadosPlanilha.classificacao}</strong>
              </div>
            )}
            {dadosPlanilha.observacao && (
              <div>
                <span className="text-muted">Observação: </span>
                <strong>{dadosPlanilha.observacao}</strong>
              </div>
            )}
          </dl>
          <div className="flex gap-2 flex-wrap">
            {dadosPlanilha.descricao && (
              <button
                onClick={usarDescricaoDaPlanilha}
                className="rounded-full border border-accent text-accent-strong font-semibold px-4 py-1.5 text-xs whitespace-nowrap hover:bg-white/40"
              >
                Usar esta descrição
              </button>
            )}
            {dadosPlanilha.ambiente && (
              <button
                onClick={usarLocalDaPlanilha}
                className="rounded-full border border-accent text-accent-strong font-semibold px-4 py-1.5 text-xs whitespace-nowrap hover:bg-white/40"
              >
                Usar "{dadosPlanilha.ambiente}" como local
              </button>
            )}
          </div>
        </div>
      )}

      {duplicado && !permitirDuplicado && (
        <div className="bg-warn/10 border border-warn/30 rounded-lg2 p-5">
          <h2 className="font-display font-bold text-base text-warn mb-1">⚠ Este tombo já foi lido antes</h2>
          <p className="text-sm text-muted mb-3">
            Já está cadastrado {duplicado.escola && (
              <>
                na escola <strong>{duplicado.escola}</strong>,{' '}
              </>
            )}
            em <strong>{duplicado.local || 'local não informado'}</strong>
            {duplicado.criado_por_nome && (
              <>
                {' '}por <strong>{duplicado.criado_por_nome}</strong>
              </>
            )}{' '}
            em {formatarDataHora(duplicado.criado_em)}
            {duplicado.descricao && <> — {duplicado.descricao}</>}.
          </p>
          <p className="text-xs text-muted mb-3">
            Por segurança, esse item nunca é substituído sozinho. Se não tiver certeza de que é o mesmo registro de
            antes (por exemplo, o bem pode ter sido movido, ou é outro item com etiqueta parecida), o mais seguro é
            salvar como novo mesmo — depois dá pra conferir e corrigir com calma em "Bens registrados". Só use
            "Atualizar" se você tiver certeza de que é o mesmo item e só quer corrigir os dados dele.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setPermitirDuplicado(true)}
              className="rounded-full bg-accent text-white font-semibold px-4 py-2 text-sm"
            >
              Salvar como novo registro (recomendado)
            </button>
            <button
              onClick={atualizarExistente}
              disabled={salvando}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
            >
              {salvando ? 'Atualizando…' : 'Atualizar o registro existente'}
            </button>
          </div>
        </div>
      )}

      {dadosGoverno && (dadosGoverno.tombamentoAntigo || (dadosGoverno.disponivelBaixa && /sim/i.test(dadosGoverno.disponivelBaixa))) && (
        <div className="flex flex-col gap-2">
          {dadosGoverno.tombamentoAntigo && (
            <p className="text-xs bg-surface-2 rounded-md2 px-3 py-2">
              ℹ Este bem tem um tombamento antigo associado: <strong>{dadosGoverno.tombamentoAntigo}</strong>.
              {dadosGoverno.tombamento && <> O tombamento atual é <strong>{dadosGoverno.tombamento}</strong>.</>}
            </p>
          )}
          {dadosGoverno.disponivelBaixa && /sim/i.test(dadosGoverno.disponivelBaixa) && (
            <p className="text-xs text-warn bg-warn/10 rounded-md2 px-3 py-2">
              ⚠ Este bem está marcado como <strong>disponível para baixa</strong> no sistema do governo — pode estar
              desativado ou obsoleto.
            </p>
          )}
        </div>
      )}

      <div className="bg-surface rounded-lg2 border border-border p-5 flex flex-col gap-3">
        <h2 className="font-display font-bold text-base">2. Detalhes</h2>

        <div>
          <label className="text-xs font-semibold text-muted">Descrição</label>
          <div className="flex flex-wrap gap-2 mt-1 mb-2">
            {DESCRICOES_RAPIDAS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDescricao(d)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                  descricao === d ? 'bg-accent text-white border-accent' : 'border-border hover:bg-surface-2'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Cadeira giratória (ou toque em um botão acima)"
              className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {suportaDitado && (
              <button
                type="button"
                onClick={alternarDitado}
                title={ditando ? 'Parar de ouvir' : 'Falar a descrição'}
                className={`rounded-md2 border px-3 py-2 text-sm font-semibold whitespace-nowrap ${
                  ditando ? 'bg-danger text-white border-danger animate-pulse' : 'border-border hover:bg-surface-2'
                }`}
              >
                {ditando ? '⏹ Ouvindo…' : '🎤 Falar'}
              </button>
            )}
          </div>
          {mensagemDescricaoEtiqueta && (
            <p className="text-xs text-accent-strong mt-1">{mensagemDescricaoEtiqueta}</p>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted">Local</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {salas.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLocal(s)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                  local === s ? 'bg-accent text-white border-accent' : 'border-border hover:bg-surface-2'
                }`}
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMostrarNovaSala((v) => !v)}
              className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-2 whitespace-nowrap"
            >
              + Novo local
            </button>
          </div>
          {salas.length === 0 && !mostrarNovaSala && (
            <p className="text-xs text-muted mt-1">Nenhum local cadastrado ainda — toque em "+ Novo local".</p>
          )}
          {mostrarNovaSala && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={novaSala}
                onChange={(e) => setNovaSala(e.target.value)}
                placeholder="Nome do novo local"
                className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
                autoFocus
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
          {dadosGoverno?.departamento && dadosGoverno.departamento.trim().toLowerCase() !== local.trim().toLowerCase() && (
            <button
              onClick={usarDepartamentoComoLocal}
              className="mt-1 text-xs font-semibold text-accent-strong hover:underline"
            >
              Usar "{dadosGoverno.departamento}" (do e-Estado) como local →
            </button>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted">Medidas do item (opcional)</label>
          <p className="text-xs text-muted mt-0.5 mb-1.5">
            Meça com uma trena/fita métrica, se tiver à mão. Sem trena, use a régua digital abaixo pra estimar a
            medida comparando com um objeto de tamanho conhecido (folha A4, cartão etc.) que apareça na foto do
            item.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={medidaLargura}
              onChange={(e) => setMedidaLargura(e.target.value)}
              placeholder="Largura (cm)"
              className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              type="text"
              inputMode="decimal"
              value={medidaAltura}
              onChange={(e) => setMedidaAltura(e.target.value)}
              placeholder="Altura (cm)"
              className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              type="text"
              inputMode="decimal"
              value={medidaProfundidade}
              onChange={(e) => setMedidaProfundidade(e.target.value)}
              placeholder="Profund. (cm)"
              className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          {!medindoPelaFoto &&
            (fotosItemPreview[0] ? (
              <button
                type="button"
                onClick={() => {
                  reiniciarCalibracao();
                  setMedindoPelaFoto(true);
                }}
                className="mt-2 text-xs font-semibold text-accent-strong hover:underline"
              >
                📐 Sem trena? Medir pela foto do item (estimativa) →
              </button>
            ) : (
              <p className="text-xs text-muted mt-2">
                Tire a foto do item mais abaixo pra poder usar a régua digital (medir pela foto).
              </p>
            ))}

          {medindoPelaFoto && fotosItemPreview[0] && (
            <div className="bg-surface-2 border border-border rounded-md2 p-3 mt-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wide">Régua digital (estimativa)</h3>
                <button type="button" onClick={fecharFerramentaMedicao} className="text-xs font-semibold text-muted hover:underline">
                  Fechar
                </button>
              </div>

              {!pxPorCm ? (
                <>
                  <p className="text-xs text-muted mb-2">
                    Passo 1 de 2: toque nas duas pontas de um objeto de tamanho conhecido que apareça NA FOTO, pra
                    calibrar a régua. Se não tiver folha nem cartão na foto, tire a foto de novo com um desses do
                    lado do item, ou digite manualmente o tamanho de algum objeto que já esteja nela.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(
                      [
                        { v: 'a4-altura', l: 'Folha A4 (29,7 cm)' },
                        { v: 'a4-largura', l: 'Folha A4 deitada (21 cm)' },
                        { v: 'cartao', l: 'Cartão/crachá (8,5 cm)' },
                        { v: 'manual', l: 'Digitar tamanho' }
                      ] as const
                    ).map((op) => (
                      <button
                        key={op.v}
                        type="button"
                        onClick={() => {
                          setTipoReferencia(op.v);
                          setPontosCalibracao([]);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                          tipoReferencia === op.v ? 'bg-accent text-white border-accent' : 'border-border hover:bg-surface'
                        }`}
                      >
                        {op.l}
                      </button>
                    ))}
                  </div>
                  {tipoReferencia === 'manual' && (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={tamanhoRefManual}
                      onChange={(e) => setTamanhoRefManual(e.target.value)}
                      placeholder="Tamanho do objeto de referência (cm)"
                      className="w-full mb-2 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  )}
                  <p className="text-xs font-semibold text-accent-strong mb-2">
                    {pontosCalibracao.length === 0
                      ? 'Toque numa ponta do objeto de referência na foto abaixo.'
                      : 'Agora toque na outra ponta do objeto de referência.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted mb-2">
                    Passo 2 de 2: escolha o que vai medir e toque nas duas pontas na foto. Pode repetir pra largura,
                    altura, profundidade e diagonais, quantas vezes quiser.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(['Largura', 'Altura', 'Profundidade', 'Diagonal'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setRotuloMedidaAtual(r);
                          setPontosMedidaAtual([]);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                          rotuloMedidaAtual === r ? 'bg-accent text-white border-accent' : 'border-border hover:bg-surface'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-accent-strong mb-2">
                    {pontosMedidaAtual.length === 0
                      ? `Toque numa ponta do que quer medir como "${rotuloMedidaAtual}".`
                      : 'Agora toque na outra ponta.'}
                  </p>
                </>
              )}

              <div className="relative w-full select-none" style={{ touchAction: 'manipulation' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgMedicaoRef}
                  src={fotosItemPreview[0]}
                  alt="Foto do item para medir"
                  onClick={tocarNaFotoParaMedir}
                  draggable={false}
                  className="w-full h-auto block rounded-md2 border border-border cursor-crosshair"
                />
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {!pxPorCm &&
                    pontosCalibracao.map((p, i) => <circle key={i} cx={p.x * 100} cy={p.y * 100} r="1.4" fill="#0E7C86" />)}
                  {!pxPorCm && pontosCalibracao.length === 2 && (
                    <line
                      x1={pontosCalibracao[0].x * 100}
                      y1={pontosCalibracao[0].y * 100}
                      x2={pontosCalibracao[1].x * 100}
                      y2={pontosCalibracao[1].y * 100}
                      stroke="#0E7C86"
                      strokeWidth="0.7"
                    />
                  )}
                  {pxPorCm &&
                    medicoesPelaFoto.map((m, i) => (
                      <line
                        key={i}
                        x1={m.p1.x * 100}
                        y1={m.p1.y * 100}
                        x2={m.p2.x * 100}
                        y2={m.p2.y * 100}
                        stroke="#D97706"
                        strokeWidth="0.7"
                      />
                    ))}
                  {pxPorCm &&
                    pontosMedidaAtual.map((p, i) => <circle key={i} cx={p.x * 100} cy={p.y * 100} r="1.4" fill="#D97706" />)}
                </svg>
              </div>

              {pxPorCm && (
                <>
                  <button type="button" onClick={reiniciarCalibracao} className="text-xs font-semibold text-muted hover:underline mt-2">
                    Errei a referência — calibrar de novo
                  </button>

                  {medicoesPelaFoto.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {medicoesPelaFoto.map((m) => (
                        <div
                          key={m.rotulo}
                          className="flex items-center justify-between text-sm bg-surface rounded-md2 border border-border px-3 py-1.5"
                        >
                          <span>
                            <strong>{m.rotulo}:</strong> {m.cm.toFixed(1).replace('.', ',')} cm
                          </span>
                          <button
                            type="button"
                            onClick={() => removerMedicaoPelaFoto(m.rotulo)}
                            className="text-xs font-semibold text-danger hover:underline"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-muted mt-3">
                    ⚠ Medição é uma estimativa visual, baseada no objeto de referência escolhido — pode ter alguns
                    centímetros de diferença. Para maior precisão, use uma trena de verdade.
                  </p>

                  <button
                    type="button"
                    onClick={aplicarMedicoesAosCampos}
                    disabled={!medicoesPelaFoto.some((m) => m.rotulo === 'Largura' || m.rotulo === 'Altura' || m.rotulo === 'Profundidade')}
                    className="w-full mt-2 rounded-md2 bg-accent text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    Usar essas medidas nos campos acima
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted">Foto do item (opcional, mas recomendado)</label>
          <p className="text-xs text-muted mt-0.5 mb-2">
            Tire uma ou mais fotos do bem inteiro — a primeira foto é analisada automaticamente pela IA do Google
            (o mesmo tipo de identificação de "tirar print e perguntar pro Google"), que tenta preencher a
            Descrição sozinha. Ao salvar, as fotos ficam guardadas no sistema (e já entram na planilha exportada em
            Relatórios, junto com a foto da etiqueta se você tirou uma lá em cima) e uma ficha em PDF é gerada na
            hora — você pode baixar ou compartilhar no WhatsApp logo depois de salvar, e passar pro Google Drive
            quando quiser.
          </p>

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
          {(identificandoItem || mensagemIdentificacao) && (
            <p className={`text-xs mt-2 ${identificandoItem ? 'text-muted' : 'text-accent-strong'}`}>{mensagemIdentificacao}</p>
          )}
          {enviandoFotos && <p className="text-xs text-muted mt-2">Enviando fotos e gerando a ficha em PDF…</p>}
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

      {dadosGoverno && (
        <div className="bg-surface rounded-lg2 border border-border p-5">
          <button
            onClick={() => setVerDadosCompletos((v) => !v)}
            className="w-full flex items-center justify-between text-left font-display font-bold text-sm text-muted"
          >
            <span>Dados completos encontrados no e-Estado</span>
            <span>{verDadosCompletos ? '▲' : '▼'}</span>
          </button>
          {verDadosCompletos && (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-3">
                {Object.entries(dadosGoverno)
                  .filter(([k]) => k !== 'descricao')
                  .map(([k, v]) => (
                    <div key={k} className="col-span-2 sm:col-span-1">
                      <dt className="text-xs text-muted uppercase tracking-wide">{rotuloCampo(k)}</dt>
                      <dd className="font-semibold break-words">{String(v)}</dd>
                    </div>
                  ))}
              </dl>
              {dadosGoverno.departamento && (
                <p className="text-xs text-muted mt-3">
                  "Departamento" é onde esse bem está registrado no sistema do governo — pode ser diferente de onde
                  você encontrou o item agora. O "Local" lá em cima é sempre o que vale pro levantamento; os dois
                  ficam guardados separados na planilha.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Traduz o erro da câmera pra uma explicação que a pessoa consegue agir —
 *  "não foi possível abrir a câmera" sozinho não ajuda ninguém a resolver. */
function mensagemErroCamera(e: any): string {
  const nome = e?.name || '';
  const texto = String(e?.message || e || '').toLowerCase();
  if (nome === 'NotAllowedError' || texto.includes('permission')) {
    return 'O celular bloqueou o acesso à câmera pra esse site. Toque no cadeado/ícone ao lado do endereço no navegador, procure "Câmera" e mude pra "Permitir", depois toque em "Abrir câmera" de novo. Enquanto isso, dá pra digitar o número do patrimônio manualmente.';
  }
  if (nome === 'NotFoundError' || texto.includes('no camera') || texto.includes('not found')) {
    return 'Não encontramos nenhuma câmera nesse aparelho/navegador. Digite o número do patrimônio manualmente.';
  }
  if (nome === 'NotReadableError' || texto.includes('in use') || texto.includes('could not start')) {
    return 'A câmera parece estar sendo usada por outro aplicativo (ou outra aba). Feche o outro app/aba e toque em "Abrir câmera" de novo, ou digite o número manualmente.';
  }
  if (nome === 'SecurityError' || texto.includes('secure')) {
    return 'O navegador bloqueou a câmera porque a conexão não é considerada segura. Confirme que o endereço começa com "https://" e tente de novo.';
  }
  return 'Não foi possível abrir a câmera (' + (nome || 'erro desconhecido') + '). Você pode digitar o número do patrimônio manualmente, ou tentar de novo depois de verificar se o site tem permissão de câmera nas configurações do navegador.';
}

/** Converte o texto digitado num campo de medida (aceita vírgula ou
 *  ponto) num número em cm, ou null se o campo estiver vazio/inválido —
 *  medida é sempre opcional, nunca trava o salvamento. */
function parseMedida(v: string): number | null {
  const limpo = v.trim().replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
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
