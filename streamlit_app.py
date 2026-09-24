"""Streamlit wrapper for Miles Apart.

The app itself is plain HTML/CSS/JS (dist/miles-apart.html, built by build-single.py).
Streamlit just serves it full-screen inside an iframe. Entries are saved in the
browser's localStorage under this app's *.streamlit.app address.
"""
import pathlib

import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(page_title="Miles Apart", page_icon="✈️", layout="wide", initial_sidebar_state="collapsed")

# Hide Streamlit chrome and let the app's iframe fill the whole screen, so the
# app's floating + button and bottom sheets stay pinned to the visible screen.
st.markdown(
    """
    <style>
      header[data-testid="stHeader"], footer, #MainMenu, [data-testid="stToolbar"],
      [data-testid="stDecoration"], [data-testid="stStatusWidget"] { display: none !important; }
      html, body, .stApp { background: #0b0a1a; overflow: hidden; }
      .block-container, [data-testid="stMainBlockContainer"] { padding: 0 !important; max-width: 100% !important; }
      [data-testid="stVerticalBlock"] { gap: 0 !important; }
      iframe { display: block; width: 100% !important; height: 100vh !important; height: 100dvh !important; border: 0; }
    </style>
    """,
    unsafe_allow_html=True,
)

html = (pathlib.Path(__file__).parent / "dist" / "miles-apart.html").read_text(encoding="utf-8")
components.html(html, height=900, scrolling=True)
