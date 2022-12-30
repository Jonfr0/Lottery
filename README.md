# Lottery Smart Contract

This is the second project I have worked on. In my future projects, I will start adding some frontend to make them user friendly and learn more about other tools and frameworks like React.js and Next.js

## Project Description

I have created a Smart Contract called Raffle, which works as a lottery system in the backend. In order to participate in it, each player has to play an entrance fee and then it gets a random number using Chainlink VRF to determine the winner. At the end, the end the Smart Contract sends the funds in the balance to the winner and it resets the lottery.

## Implementation

Try running some of the following tasks (nmp or yarn package managers will work):

```
npm hardhat test // You can see all of the Mock tests in the localhost
npm hardhat test --network goerli // ~
npm hardhat coverage
```

P.S. ~ To use goerli network you need a subcription ID in Chainlink and you need to change it in the `helper-hardhat-config.js` file. You also need approximately 20 LINK, and 0.5 goerliETH in gas fees to execute all of the transactions.

Here are some testnet faucets if you need them:
##### https://goerli-faucet.pk910.de/
##### https://faucets.chain.link/
