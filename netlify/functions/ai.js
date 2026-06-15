exports.handler = async (event) => {
  if(event.httpMethod==='OPTIONS') return{statusCode:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'},body:''};
  if(event.httpMethod!=='POST') return{statusCode:405,body:'Method not allowed'};
  try{
    const{message,products}=JSON.parse(event.body);
    const productList=products&&products.length
      ?products.slice(0,20).map(p=>`- ${p.name} (${p.cat}) — RWF ${p.price}, Stock: ${p.stock}, Seller: ${p.seller}`).join('\n')
      :'No products available';
    const systemPrompt=`You are a friendly AI shopping assistant for SOKO, Rwanda's #1 marketplace. 
Here are the current products available on SOKO:
${productList}

Help users find products, answer questions about prices, delivery, payments (MTN MoMo, Airtel Money), escrow protection, and selling on SOKO. 
Keep answers short, friendly and helpful. 
Always respond in the same language the user writes in (English, French, or Kinyarwanda).`;

    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:message}]}],
        systemInstruction:{role:'system',parts:[{text:systemPrompt}]}
      })
    });
    const data=await response.json();
    console.log('Gemini response:',JSON.stringify(data));
    const reply=data.candidates?.[0]?.content?.parts?.[0]?.text||'Sorry, I could not get a response.';
    return{
      statusCode:200,
      headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},
      body:JSON.stringify({reply})
    };
  }catch(e){
    console.log('Error:',e.message);
    return{statusCode:500,headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({error:e.message})};
  }
};