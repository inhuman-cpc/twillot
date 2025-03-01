;(function () {
  const config = {
    env: 'production',
    token: 'live_9233313a92afcfb5b4887874b7e',
    product_name: 'ssf',
    priceItems: {
      business: 'pri_01j70dtsgvtafd7c3skj4g8j7s',
      pro: 'pri_01j70ds81j85jpw0dbak0gya41',
    },
    // 确保和 pricing 页面同级
    welcomeUrl: './welcome?utm_source=paddle',
    scriptSrc: 'https://cdn.paddle.com/paddle/v2/paddle.js',
  }

  const handleCheckoutCompleted = (data) => {
    const entries = Object.entries(config.priceItems)
    const entry = entries.find(
      ([name, priceId]) => priceId === data.data.items[0].price_id,
    )
    if (!entry) {
      alert('Invalid price item')
      return
    }
    location.href = config.welcomeUrl
  }

  const initializePaddle = () => {
    Paddle.Environment.set(config.env)
    Paddle.Initialize({
      token: config.token,
      eventCallback: (data) => {
        if (data.name === 'checkout.completed') {
          handleCheckoutCompleted(data)
        }
      },
    })

    document.querySelector('#btn-pro a').addEventListener('click', () => {
      Paddle.Checkout.open({
        items: [{ priceId: config.priceItems.pro, quantity: 1 }],
      })
    })
    document.querySelector('#btn-business a').addEventListener('click', () => {
      Paddle.Checkout.open({
        items: [{ priceId: config.priceItems.business, quantity: 1 }],
      })
    })
  }

  const script = document.createElement('script')
  script.src = config.scriptSrc
  script.async = true
  script.onload = initializePaddle
  document.head.appendChild(script)
})()
