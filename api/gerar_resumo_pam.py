# -*- coding: utf-8 -*-
"""
api/gerar_resumo_pam.py — WRAPPER HTTP (Vercel Python) do gerador oficial.

Passo A: provar/pôr a correr python3 + reportlab em produção. NÃO altera nem
move nem duplica o gerador congelado (docs/modelos/pam/modelo_resumo_pam.py) —
localiza-o no bundle em runtime e carrega-o via importlib.

- POST /api/gerar_resumo_pam   body = JSON oficial (spec secção 8) -> application/pdf
- GET  /api/gerar_resumo_pam   health-check + DIAGNÓSTICO do filesystem real da função

Erros SEMPRE ruidosos: payload inválido -> 400 com campos em falta; import/
geração falhados -> 500 com a causa; nada silenciado.

CAUSA DO ModuleNotFoundError anterior: `import modelo_resumo_pam` dependia de o
ficheiro estar num caminho fixo do sys.path. O tracer do Vercel não segue
sys.path dinâmico; o includeFiles pode colocá-lo noutro sítio (ou não o
colocar). Este localizador procura-o onde quer que esteja no bundle e, se não
existir, o health-check imprime o filesystem real para a próxima iteração.
"""

import glob
import importlib.util
import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

_NOME = "modelo_resumo_pam.py"
_ESTE = os.path.abspath(__file__)
# Raiz do bundle da função: .../api/gerar_resumo_pam.py -> sobe 1 nível (api) -> raiz.
_RAIZ = os.path.dirname(os.path.dirname(_ESTE))


def _localizar():
    """Encontra o gerador congelado no bundle. Devolve (caminho|None, diagnostico)."""
    diag = {"raiz": _RAIZ, "cwd": os.getcwd(), "este": _ESTE, "tentativas": []}
    esperado = os.path.join(_RAIZ, "docs", "modelos", "pam", _NOME)
    diag["esperado"] = esperado
    diag["esperado_existe"] = os.path.isfile(esperado)

    # 1) Caminhos diretos prováveis (baratos, sem walk).
    diretos = [
        esperado,
        os.path.join(os.getcwd(), "docs", "modelos", "pam", _NOME),
        os.path.normpath(os.path.join(os.path.dirname(_ESTE), "..", "docs", "modelos", "pam", _NOME)),
    ]
    for p in diretos:
        diag["tentativas"].append(p)
        if os.path.isfile(p):
            diag["encontrado_via"] = "direto"
            return p, diag

    # 2) Procura recursiva LIMITADA à raiz do bundle (dir pequeno; nunca a partir de /).
    for achado in glob.glob(os.path.join(_RAIZ, "**", _NOME), recursive=True):
        diag["tentativas"].append("glob:" + achado)
        if os.path.isfile(achado):
            diag["encontrado_via"] = "glob"
            return achado, diag

    diag["encontrado_via"] = None
    return None, diag


def _carregar():
    caminho, diag = _localizar()
    if not caminho:
        return None, "modelo_resumo_pam.py NAO encontrado no bundle", diag
    try:
        spec = importlib.util.spec_from_file_location("modelo_resumo_pam", caminho)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # executa o ficheiro congelado NO SÍTIO (sem copiar)
        diag["carregado_de"] = caminho
        return mod.gerar_resumo_pam, None, diag
    except Exception as e:  # noqa: BLE001 — qualquer causa tem de ser visível
        return None, repr(e), diag


gerar_resumo_pam, _IMPORT_ERRO, _DIAG = _carregar()


def _listar(caminho):
    try:
        return sorted(os.listdir(caminho))
    except Exception as e:  # noqa: BLE001
        return "erro: " + repr(e)


def _validar(dados):
    """Devolve a lista de campos obrigatórios em falta/inválidos (spec secção 8)."""
    if not isinstance(dados, dict):
        return ["corpo JSON tem de ser um objeto"]
    faltam = []
    for k in ("numero_pam", "subtitulo", "parecer", "parecer_texto", "seccao3", "seccao4"):
        v = dados.get(k)
        if not isinstance(v, str) or not v.strip():
            faltam.append(k)

    s1 = dados.get("seccao1")
    grupos = s1.get("grupos") if isinstance(s1, dict) else None
    if not isinstance(grupos, list) or not grupos:
        faltam.append("seccao1.grupos")
    else:
        for i, g in enumerate(grupos):
            if not isinstance(g, dict) or not isinstance(g.get("titulo"), str):
                faltam.append("seccao1.grupos[%d].titulo" % i)
            arts = g.get("artigos") if isinstance(g, dict) else None
            if not isinstance(arts, list) or not arts:
                faltam.append("seccao1.grupos[%d].artigos" % i)
            else:
                for j, a in enumerate(arts):
                    for c in ("artigo", "descricao", "diametros", "quantidades", "norma"):
                        if not isinstance(a, dict) or c not in a:
                            faltam.append("seccao1.grupos[%d].artigos[%d].%s" % (i, j, c))

    s2 = dados.get("seccao2")
    linhas = s2.get("linhas") if isinstance(s2, dict) else None
    if not isinstance(linhas, list) or not linhas:
        faltam.append("seccao2.linhas")
    else:
        for i, r in enumerate(linhas):
            for c in ("seccao", "requisito", "verificacao"):
                if not isinstance(r, dict) or c not in r:
                    faltam.append("seccao2.linhas[%d].%s" % (i, c))

    if not isinstance(dados.get("seccao5"), list):
        faltam.append("seccao5 (lista)")
    return faltam


class handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        info = {
            "runtime": "python",
            "python": sys.version.split()[0],
            "modelo_importado": gerar_resumo_pam is not None,
            "import_erro": _IMPORT_ERRO,
            # DIAGNÓSTICO do filesystem real — revela onde (ou se) o ficheiro está no bundle.
            "diag": _DIAG,
            "raiz_listagem": _listar(_RAIZ),
            "docs_pam_listagem": _listar(os.path.join(_RAIZ, "docs", "modelos", "pam")),
        }
        try:
            import reportlab
            info["reportlab"] = reportlab.Version
        except Exception as e:  # noqa: BLE001
            info["reportlab_erro"] = repr(e)
        self._json(200, info)

    def do_POST(self):
        if gerar_resumo_pam is None:
            return self._json(500, {"erro": "modelo_resumo_pam nao carregado", "detalhe": _IMPORT_ERRO, "diag": _DIAG})

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return self._json(400, {"erro": "corpo vazio"})

        raw = self.rfile.read(length)
        try:
            dados = json.loads(raw.decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            return self._json(400, {"erro": "JSON invalido", "detalhe": str(e)})

        faltam = _validar(dados)
        if faltam:
            return self._json(400, {"erro": "campos obrigatorios em falta ou invalidos", "campos": faltam})

        buf = io.BytesIO()
        try:
            gerar_resumo_pam(dados, buf)  # SimpleDocTemplate aceita file-like -> sem ficheiro temporario
        except Exception as e:  # noqa: BLE001 — falha de geracao NUNCA silenciada
            return self._json(500, {"erro": "falha ao gerar PDF", "detalhe": repr(e)})

        pdf = buf.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Disposition", 'attachment; filename="PAM_Resumo_%s.pdf"' % dados["numero_pam"])
        self.send_header("Content-Length", str(len(pdf)))
        self.end_headers()
        self.wfile.write(pdf)
