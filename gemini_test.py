import google.generativeai as genai

try:
    # Configure the client with the API key
    genai.configure(api_key="AIzaSyCgApL0WeAXg4ZZyElZuzs3IdCNFZwDq64")

    # Create the model
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
    )

    # Get the prompt from the command line
    import sys
    prompt = " ".join(sys.argv[1:])

    # Send the prompt to the model
    response = model.generate_content(prompt)

    print(response.text)

except Exception as e:
    print(f"An error occurred: {e}")
