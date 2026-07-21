# -*- coding: utf-8 -*-
"""
modelo_resumo_pam.py — GERADOR OFICIAL DO RESUMO PAM (Obra 2602 · Fiscalização)
================================================================================
REGRA ABSOLUTA: as constantes de layout deste ficheiro estão CONGELADAS.
É PROIBIDO alterar fontes, tamanhos, cores, margens, larguras de coluna,
paddings, espaçamentos ou a estrutura de 5 secções. Apenas os DADOS variam,
e entram exclusivamente através do JSON passado ao gerador.

Formato validado por comparação byte-a-byte de operadores PDF contra o
documento oficial PAM011_Resumo_Final (17/07/2026).

Uso:
    python modelo_resumo_pam.py dados.json saida.pdf
"""

import json
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer,
)
from reportlab.lib.styles import ParagraphStyle

# ============================================================================
# CONSTANTES DE LAYOUT — CONGELADAS. NÃO ALTERAR.
# ============================================================================
COR_TEXTO       = HexColor("#000000")   # texto principal
COR_SUBTITULO   = HexColor("#555555")   # linha de contexto sob o título
COR_GRELHA      = HexColor("#808080")   # linhas das tabelas (0,5 pt)
COR_CABECALHO   = HexColor("#D9D9D9")   # fundo da linha de cabeçalho
COR_SUBSECCAO   = HexColor("#F2F2F2")   # fundo das linhas de fase/subsecção

FONTE           = "Helvetica"
FONTE_BOLD      = "Helvetica-Bold"

TAM_TITULO      = 13    # pt
TAM_SUBTITULO   = 7.5   # pt
TAM_SECCAO      = 10    # pt
TAM_CORPO       = 8.5   # pt
ENTRELINHA      = 11    # pt (leading universal)

MARGEM_ESQ_TXT  = 40.01575          # pt — parágrafos
MARGEM_TABELA   = 34.01575          # pt — tabelas (186 mm centradas em A4)
LARGURA_TABELA  = 186 * mm          # 527.2441 pt
MARGEM_TOPO     = 28.3465           # pt — (o frame tem padding interno de 6 pt)
MARGEM_FUNDO    = 12 * mm

ESPACO_POS_TITULO    = 2   # pt
ESPACO_POS_SUBTITULO = 6   # pt
ESPACO_POS_CORPO     = 6   # pt
ESPACO_PRE_SECCAO    = 8   # pt
ESPACO_POS_SECCAO    = 3   # pt

PAD_ESQ, PAD_DIR, PAD_TOPO, PAD_FUNDO = 4, 4, 2, 2   # paddings de célula, pt

# Larguras de coluna (mm) — CONGELADAS
COLS_TABELA_MQT = [20 * mm, 62 * mm, 32 * mm, 42 * mm, 30 * mm]   # secção 1
COLS_TABELA_CTE = [34 * mm, 66 * mm, 86 * mm]                     # secção 2

# ============================================================================
# ESTILOS DE PARÁGRAFO — CONGELADOS. NÃO ALTERAR.
# ============================================================================
ST_TITULO = ParagraphStyle(
    "titulo", fontName=FONTE_BOLD, fontSize=TAM_TITULO, leading=ENTRELINHA,
    textColor=COR_TEXTO, spaceAfter=ESPACO_POS_TITULO,
)
ST_SUBTITULO = ParagraphStyle(
    "subtitulo", fontName=FONTE, fontSize=TAM_SUBTITULO, leading=ENTRELINHA,
    textColor=COR_SUBTITULO, spaceAfter=ESPACO_POS_SUBTITULO,
)
ST_CORPO = ParagraphStyle(
    "corpo", fontName=FONTE, fontSize=TAM_CORPO, leading=ENTRELINHA,
    textColor=COR_TEXTO, spaceAfter=ESPACO_POS_CORPO,
)
ST_SECCAO = ParagraphStyle(
    "seccao", fontName=FONTE_BOLD, fontSize=TAM_SECCAO, leading=ENTRELINHA,
    textColor=COR_TEXTO, spaceBefore=ESPACO_PRE_SECCAO,
    spaceAfter=ESPACO_POS_SECCAO,
)
ST_CELULA = ParagraphStyle(
    "celula", fontName=FONTE, fontSize=TAM_CORPO, leading=ENTRELINHA,
    textColor=COR_TEXTO,
)
ST_CELULA_BOLD = ParagraphStyle(
    "celula_bold", parent=ST_CELULA, fontName=FONTE_BOLD,
)

# ============================================================================
# ESTILO DE TABELA — CONGELADO. NÃO ALTERAR.
# ============================================================================
def _estilo_tabela(linhas_subseccao):
    """linhas_subseccao: índices (0-based) das linhas de fase/subsecção."""
    cmds = [
        ("GRID",          (0, 0), (-1, -1), 0.5, COR_GRELHA),
        ("BACKGROUND",    (0, 0), (-1, 0),  COR_CABECALHO),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE",      (0, 0), (-1, -1), TAM_CORPO),
        ("LEADING",       (0, 0), (-1, -1), ENTRELINHA),
        ("LEFTPADDING",   (0, 0), (-1, -1), PAD_ESQ),
        ("RIGHTPADDING",  (0, 0), (-1, -1), PAD_DIR),
        ("TOPPADDING",    (0, 0), (-1, -1), PAD_TOPO),
        ("BOTTOMPADDING", (0, 0), (-1, -1), PAD_FUNDO),
    ]
    for i in linhas_subseccao:
        cmds.append(("SPAN",       (0, i), (-1, i)))
        cmds.append(("BACKGROUND", (0, i), (-1, i), COR_SUBSECCAO))
    return TableStyle(cmds)


def _p(texto, estilo):
    return Paragraph(texto, estilo)


def _tabela_mqt(dados):
    """Secção 1 — tabela de artigos do MQT (5 colunas, subsecções de fase)."""
    linhas = [[_p(h, ST_CELULA_BOLD) for h in
               ["Artigo", "Descrição", "Ø (mm)", "Quant. (m)", "Norma"]]]
    subsec = []
    for grupo in dados["grupos"]:
        subsec.append(len(linhas))
        linhas.append([_p(grupo["titulo"], ST_CELULA_BOLD), "", "", "", ""])
        for a in grupo["artigos"]:
            linhas.append([
                _p(a["artigo"], ST_CELULA),
                _p(a["descricao"], ST_CELULA),
                _p(a["diametros"], ST_CELULA),
                _p(a["quantidades"], ST_CELULA),
                _p(a["norma"], ST_CELULA),
            ])
    t = Table(linhas, colWidths=COLS_TABELA_MQT)
    t.setStyle(_estilo_tabela(subsec))
    return t


def _tabela_cte(dados):
    """Secção 2 — tabela de secções dos CTE (3 colunas)."""
    linhas = [[_p(h, ST_CELULA_BOLD) for h in
               ["CTE / Secção", "Requisito de projeto", "Verificação"]]]
    for r in dados["linhas"]:
        linhas.append([
            _p(r["seccao"], ST_CELULA),
            _p(r["requisito"], ST_CELULA),
            _p(r["verificacao"], ST_CELULA),
        ])
    t = Table(linhas, colWidths=COLS_TABELA_CTE)
    t.setStyle(_estilo_tabela([]))
    return t


def _condicoes(itens):
    """Secção 5 — alíneas a), b), c)... em parágrafo corrido, letras a bold."""
    partes = []
    for i, txt in enumerate(itens):
        letra = chr(ord("a") + i)
        partes.append(f"<b>{letra})</b> {txt}")
    return "; ".join(partes) + "."


def gerar_resumo_pam(dados, caminho_saida):
    doc = SimpleDocTemplate(
        caminho_saida, pagesize=A4,
        leftMargin=MARGEM_TABELA, rightMargin=MARGEM_TABELA,
        topMargin=MARGEM_TOPO, bottomMargin=MARGEM_FUNDO,
    )
    n = dados["numero_pam"]
    fluxo = [
        _p(f"Análise de Pedido de Aprovação de Materiais, PAM {n}", ST_TITULO),
        _p(dados["subtitulo"], ST_SUBTITULO),
        _p(f"<b>Parecer final: {dados['parecer']}</b> {dados['parecer_texto']}",
           ST_CORPO),
        _p(f"1. Artigos do MQT abrangidos pelo PAM {n}", ST_SECCAO),
        _tabela_mqt(dados["seccao1"]),
        _p(f"2. Secções dos CTE (Memórias Descritivas) aplicáveis ao PAM {n}",
           ST_SECCAO),
        _tabela_cte(dados["seccao2"]),
        _p("3. Documentos que suportam a aprovação", ST_SECCAO),
        _p(dados["seccao3"], ST_CORPO),
        _p(f"4. Documentos entregues sem aplicação ao PAM {n}", ST_SECCAO),
        _p(dados["seccao4"], ST_CORPO),
        _p("5. Condições da aprovação", ST_SECCAO),
        _p(_condicoes(dados["seccao5"]), ST_CORPO),
    ]
    doc.build(fluxo)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python modelo_resumo_pam.py dados.json saida.pdf")
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        gerar_resumo_pam(json.load(f), sys.argv[2])
    print(f"OK — {sys.argv[2]} gerado.")
