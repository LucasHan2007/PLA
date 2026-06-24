import streamlit as st

login = st.Page("pages/login.py", title="登录", icon="🔑")
ide = st.Page("pages/ide.py", title="IDE 工作区", icon="📝", default=True)
page1 = st.Page("pages/page1.py", title="简洁聊天", icon="💬")

pg = st.navigation([login, ide, page1])
pg.run()
