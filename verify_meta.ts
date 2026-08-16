import 'dotenv/config';
async function run() {
  const campaignId = '120249837681030673';
  const token = "EAAkr7Y9S2qYBQfHTNZASIugAzOi8b2MZCBct4z4jZBHSmQ2KGlFduuDQQGEYC9NRDtZBUdhMPdeJ06OjYUiJYGfFkZCAxzyh4TdidN7ZA10K3XPOVEiQh01jo22xLsQjXrEtMHc5ZCHZBbRZAyA5d0pl26Jsg3IuNKY272QYmqEjHghf11OKJmbUZBfJLe5EvHzl48gAZDZD";
  
  const res = await fetch(`https://graph.facebook.com/v20.0/${campaignId}?fields=id,name,status,effective_status,account_id,adsets{id,name,status,effective_status,ads{id,name,status,effective_status}}&access_token=${token}`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();
