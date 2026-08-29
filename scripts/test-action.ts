async function testServerAction() {
    console.log('Sending login POST request...')
    const res = await fetch('http://localhost:3002/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW',
            'Next-Action': 'c102bdcad055df27edbe346487e834927f804791', // Note: usually Next-Action changes build to build, we can just hit the API endpoint if there is one for login?
        },
        body: '------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name="1_email"\r\n\r\nadmin@sungaipenuh.com\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name="1_password"\r\n\r\nadmin123\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n'
    })

    console.log('Status', res.status)
    const setCookie = res.headers.get('set-cookie')
    console.log('Set-Cookie Header:', setCookie)
}

testServerAction().catch(console.error)
