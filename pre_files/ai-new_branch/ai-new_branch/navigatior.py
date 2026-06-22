import streamlit as st

# 定义页面
login = st.Page("pages/login.py", title="登录页面", icon="📄")
page1 = st.Page("pages/page1.py", title="页面1", icon="📄")


# 创建导航S
pg = st.navigation([login,page1])

# 运行当前选中的页面
pg.run()