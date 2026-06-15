exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return {statusCode:405,body:'Method not allowed'};
  try{
    const{message}=JSON.parse(event.body);
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        contents:[{parts:[{text:message}]}],
        systemInstruction:{parts:[{text:"You are a helpful assistant for SOKO, Rwanda's #1 marketplace. Help users with products, orders, selling, payments (MTN MoMo, Airtel Money), delivery, and escrow. Keep answers short and friendly. Always respond in the same language the user writes in (English, French, or Kinyarwanda)."}]}
      })
    });
    const data=await response.json();
    const reply=data.candidates?.[0]?.content?.parts?.[0]?.text||'Sorry, I could not get a response.';
    return{
      statusCode:200,
      headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},
      body:JSON.stringify({reply})
    };
  }catch(e){
    return{statusCode:500,body:JSON.stringify({error:e.message})};
  }
};