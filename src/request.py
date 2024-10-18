import requests
import json

# API URL
url = "http://localhost:11434/api/generate"

# 请求数据 (JSON)
data = {"model": "starcoder", "prompt": "def compute_gcd(a,b):", "stream": False}

try:
    # 发送 POST 请求
    response = requests.post(url, json=data)

    # 检查响应状态码
    if response.status_code == 200:
        try:
            # 尝试解析 JSON 响应
            json_data = response.json()
            # 打印 response 字段的内容
            if "response" in json_data:
                print(json.dumps(json_data["response"], indent=2))
            else:
                print("response 字段不存在。")
        except json.JSONDecodeError as e:
            print(f"JSON 解析错误: {e}")
            print("原始响应内容：")
            print(response.text)  # 打印原始响应内容进行调试
    else:
        print(f"请求失败，状态码: {response.status_code}")
        print(response.text)  # 打印错误信息

except requests.exceptions.RequestException as e:
    print(f"请求过程中出现错误: {e}")

# import ollama

# client = ollama.Client(host="http://localhost:11434")

# try:

#     response = client.generate(
#         model="starcoder",
#         prompt=f"def compute_gcd(a,b):",
#         # options={
#         #     "num_predict": 256,
#         #     "temperature": 0,
#         #     "top_p": 0.9,
#         #     "stop": ["<|file_separator|>"],
#         # },
#     )
#     print(response)
#     print(response.get("response"), end="\n")

# except ollama.ResponseError as e:
#     print("Error:", e.status_code)
