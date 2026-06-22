import os
def create_file_name(name):
    path=os.path.join(os.getcwd(),name)
    counter=1
    while True:
        if os.path.exists(path):
            path = os.join(os.getcwd(), name+"_"+str(counter))
            counter += 1
        else:
            return path
def save_history(history,name="对话历史.txt"):
    file_name=create_file_name(name)
    with open(file_name,"w",encoding="utf-8") as f:
        f.write(history)
def message_to_string(messages):
    history=""
    set=""
    for message in messages:
        role=message["role"]
        content=message["content"]
        if role=="system":
            set=content
        if role=="user":
            history+="你: "+content+"\n"
        elif role=="assistant":
            history+="助手: "+content+"\n"
    return set,history

