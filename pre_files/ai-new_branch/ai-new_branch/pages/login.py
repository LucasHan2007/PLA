import streamlit as st
import os
import datetime
from openai import OpenAI

# ========== 页面配置 ==========
st.set_page_config(page_title="AI编程助手", page_icon="🤖")

st.header("你好，这是一个AI辅助的编程工具")
today = st.date_input("今天的日期", datetime.datetime.now())

st.title("登录界面")

# ========== 初始化 session_state ==========
if 'client' not in st.session_state:
    st.session_state.logged_in = '未登录'
    st.session_state.client = None
    st.session_state.profile = ""
    st.session_state.username = ""
    

# 显示当前状态（调试用）
st.write(f"当前登录状态: {st.session_state.logged_in}")

# API 字典
api_dict = {
    "千问": "https://api.qianwenapi.com/v1/chat/completions",
    "豆包": "https://api.doubao.ai/v1/chat/completions",
    "OpenAI": "https://api.openai.com/v1/chat/completions",
    "GPT": "https://api.gpt.ai/v1/chat/completions",
    "deepseek": "https://api.deepseek.com/v1/chat/completions",
    "Gemini": "https://api.deepseek.com/v1/chat/completions",
    "文心一言": "https://yiyan.baidu.com/v1/chat/completions",
    "讯飞星火": "https://spark-api.xf-yun.com/v1/rest/v1/chat/completions"
}

# ========== 登录表单 ==========
with st.form("login_form"):
    username = st.text_input("用户名")
    base_url = st.selectbox("请选择你的供应商", ['千问', '豆包', 'OpenAI', 'GPT', "deepseek", "Gemini", '文心一言', "讯飞星火", "其他"])
    key = st.text_input("请输入你的API Key", type="password")
    
    # 自定义API地址（当选择"其他"时显示）
    custom_url = None
    custom_key = None
    if base_url == "其他":
        custom_url = st.text_input("API地址")
        custom_key = st.text_input("API Key", type="password")
    
    # ✅ 使用 form_submit_button 而不是 st.button
    submitted = st.form_submit_button("提交")
    
    if submitted:
        if username and base_url:
            try:
                # 处理登录逻辑
                if username == "1234567890":  # 管理员账户
                    st.session_state.profile = "管理员"
                    st.session_state.username = username
                    api = os.getenv("墙木的key")
                    if api:
                        # ✅ 使用 st.session_state.client
                        st.session_state.client = OpenAI(api_key=api, base_url="https://api.deepseek.com/v1")
                        st.session_state.logged_in = "已登录"
                        st.success("管理员登录成功！")
                        st.balloons()
                        st.switch_page("pages/page1.py")
                    else:
                        st.error("环境变量'墙木的key'未设置")
                        
                elif base_url == "其他":
                    if custom_url and custom_key:
                        st.session_state.profile = "用户"
                        st.session_state.username = username
                        # 保存用户自定义配置
                        if "user_api_config" not in st.session_state:
                            st.session_state.user_api_config = {}
                        st.session_state.user_api_config[username] = {"url": custom_url, "key": custom_key}
                        st.session_state.client = OpenAI(api_key=custom_key, base_url=custom_url)
                        st.session_state.logged_in = "已登录"
                        st.success("登录成功！")
                        st.balloons()
                        st.switch_page("pages/page1.py")            
                    else:
                        st.warning("自定义API地址和Key不能为空")
                        
                elif key and base_url in api_dict:
                    st.session_state.profile = "用户"
                    st.session_state.username = username
                    st.session_state.client = OpenAI(api_key=key, base_url=api_dict[base_url])
                    st.session_state.logged_in = "已登录"
                    st.success("连接成功！")
                    st.balloons()
                    st.switch_page("pages/page1.py")
                else:
                    st.error("请填写完整信息")
            except Exception as e:
                st.error(f"连接失败: {e}")
        else:
            st.error("请填写用户名和供应商")

# ========== 游客登录按钮 ==========
st.write("---")
if st.button("游客登录"):
    st.session_state.logged_in = "已登录"
    st.session_state.username = "游客"
    st.session_state.profile = "普通用户"
    st.session_state.client = None
    st.success("游客登录成功！")
    st.switch_page("pages/page1.py")