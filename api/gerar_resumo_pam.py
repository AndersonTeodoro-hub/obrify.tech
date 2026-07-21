# -*- coding: utf-8 -*-
"""
api/gerar_resumo_pam.py — WRAPPER HTTP (Vercel Python) do gerador oficial.

TESTE EMPÍRICO (Passo A): provar se o Vercel corre python3 + reportlab em
produção. NÃO altera nem move o gerador congelado — importa-o do sítio
(docs/modelos/pam/modelo_resumo_pam.py) via sys.path.

- POST  /api/gerar_resumo_pam   body = JSON oficial (spec secção 8) -> application/pdf
- GET   /api/gerar_resumo_pam   health-check (runtime, versão do reportlab, import OK)

Erros SEMPRE ruidosos: payload inválido -> 400 com a lista de campos em falta;
import/geração falhados -> 500 com a causa (nunca silenciados).
"""

import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

# O gerador congelado fica fora de api/. Carrega-se do sítio (não se move nem altera).
# includeFiles em vercel.json garante que o ficheiro entra no bundle da função.
_MODELO_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "docs", "modelos", "pam")
)
if _MODELO_DIR not in sys.path:
    sys.path.insert(0, _MODELO_DIR)

# Import tolerante a falha: se o bundle não incluiu o ficheiro ou faltar reportlab,
# o módulo continua a carregar e o erro é REPORTADO (health-check / 500), não escondido.
try:
    from modelo_resumo_pam import gerar_resumo_pam  # type: ignore
    _IMPORT_ERRO = None
except Exception as e:  # noqa: BLE001 — queremos ver QUALQUER causa
    gerar_resumo_pam = None
    _IMPORT_ERRO = repr(e)


def _validar(dados):
    """Devolve a lista de campos obrigatórios em falta/ inválidos (spec secção 8)."""
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
        }
        if _IMPORT_ERRO:
            info["import_erro"] = _IMPORT_ERRO
        try:
            import reportlab
            info["reportlab"] = reportlab.Version
        except Exception as e:  # noqa: BLE001
            info["reportlab_erro"] = repr(e)
        self._json(200, info)

    def do_POST(self):
        if gerar_resumo_pam is None:
            return self._json(500, {"erro": "modelo_resumo_pam nao importado", "detalhe": _IMPORT_ERRO})

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
