# 初始对话历史
from openai import OpenAI 
import functions
import os
client = OpenAI(
    base_url="https://api.deepseek.com/v1",
    api_key=os.getenv("墙木的key")
)
messages = [{"role": "system", "content": "你是一个助手"}]

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
print("\n对话结束。")
print(messages)
tempt=input("\n是否保存对话历史(Y?N)")
if tempt == "Y" or tempt == "y":
    history=functions.message_to_string(messages)
    functions.save_history(history[1],history[0])
