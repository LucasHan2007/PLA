import os
from openai import OpenAI

# 1. 初始化客户端
client = OpenAI(
    api_key="sk-af3ec2d1c60b48a4b4f1cbceb519dbee",          # 替换为你的 API Key
    base_url="https://api.deepseek.com",   # 指定 DeepSeek 的 API 地址
)

# 2. 发起对话请求
response = client.chat.completions.create(
    model="deepseek-v4-pro",           # 使用最新的 Pro 模型
  
    stream=False                       # 非流式输出，一次返回完整结果
)

 
messages=[
        {"role": "system", "content": "你是一个辅助学习编程,算法知识的老师,需要引导学生进行引导。"}, # 设定系统角色
        {"role": "user", "content": "你好！"}                  # 用户提问
    ]
while True:
    user_input = input("你: ")
    if user_input == "退出":
        break
    
    messages.append({"role": "user", "content": user_input})   # 加用户的话
    
    response = client.chat.completions.create(
        model="deepseek-v4-pro",
        messages=messages
    )
    
    assistant_reply = response.choices[0].message.content
    print("助手:", assistant_reply)
    
    messages.append({"role": "assistant", "content": assistant_reply})  # 加助手的回复
# 3. 打印回复
print(response.choices[0].message.content)