import streamlit as st
import os
import datetime
from openai import OpenAI
import time
#"""登录界面，负责登录逻辑和api接受"""
st.set_page_config(page_title="AI编程助手", page_icon="🤖")

st.header("你好，这是一个 AI 辅助的编程工具")
st.date_input("今天的日期", datetime.datetime.now())
st.title("登录界面")

if "client" not in st.session_state:
    st.session_state.logged_in = "未登录"
    st.session_state.client = None
    st.session_state.profile = ""
    st.session_state.username = ""
    st.session_state.api_provider = ""

# OpenAI 兼容 API 的 base_url（不含 /chat/completions）
API_PROVIDERS = {
    "千问": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "豆包": "https://ark.cn-beijing.volces.com/api/v3",
    "OpenAI": "https://api.openai.com/v1",
    "GPT": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "Gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "文心一言": "https://qianfan.baidubce.com/v2",
    "讯飞星火": "https://spark-api-open.xf-yun.com/v1",
}

with st.form("login_form"):
    username = st.text_input("用户名")
    base_url = st.selectbox(
        "请选择你的供应商",
        ["千问", "豆包", "OpenAI", "GPT", "deepseek", "Gemini", "文心一言", "讯飞星火", "其他"],
    )
    key = st.text_input("请输入你的 API Key", type="password")

    custom_url = None
    custom_key = None
    if base_url == "其他":
        custom_url = st.text_input("API 地址（OpenAI 兼容 base_url）")
        custom_key = st.text_input("API Key", type="password")

    submitted = st.form_submit_button("提交")

    if submitted:
        if not username or not base_url:
            st.error("请填写用户名和供应商")
        else:
            try:
                admin_user = os.getenv("ADMIN_USERNAME", "1234567890")
                if username == admin_user:
                    st.session_state.profile = "管理员"
                    st.session_state.username = username
                    st.session_state.api_provider = "管理员"
                    api = os.getenv("墙木的key")
                    if api:
                        st.session_state.client = OpenAI(api_key=api, base_url="https://api.deepseek.com/v1")
                        st.session_state.logged_in = "已登录"
                        st.session_state.selected_model = "deepseek-chat"
                        st.success("管理员登录成功！")
                        st.balloons()
                        
                        st.switch_page("pages/page1.py")
                    else:
                        st.error("环境变量「墙木的key」未设置")

                elif base_url == "其他":
                    if custom_url and custom_key:
                        st.session_state.profile = "用户"
                        st.session_state.username = username
                        st.session_state.api_provider = "其他"
                        st.session_state.client = OpenAI(api_key=custom_key, base_url=custom_url.rstrip("/"))
                        st.session_state.logged_in = "已登录"
                        st.success("登录成功！")
                        st.balloons()
                    
                        st.switch_page("pages/page1.py")
                    else:
                        st.warning("自定义 API 地址和 Key 不能为空")

                elif key and base_url in API_PROVIDERS:
                    st.session_state.profile = "用户"
                    st.session_state.username = username
                    st.session_state.api_provider = base_url
                    st.session_state.client = OpenAI(api_key=key, base_url=API_PROVIDERS[base_url])
                    st.session_state.logged_in = "已登录"
                    st.success("连接成功！")
                    st.balloons()
                
                    st.switch_page("pages/page1.py")
                else:
                    st.error("请填写完整的 API Key")
            except Exception as e:
                st.error(f"连接失败: {e}")

st.write("---")
if st.button("游客登录"):
    st.session_state.logged_in = "已登录"
    st.session_state.username = "游客"
    st.session_state.profile = "普通用户"
    st.session_state.api_provider = "游客"
    st.session_state.client = None
    st.success("游客登录成功！")
    st.balloons()
    
    st.switch_page("pages/page1.py")
