const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config")
const { getNamedAccounts, deployments, ethers } = require("hardhat")
const { inputToConfig } = require("@ethereum-waffle/compiler")
const { assert, expect } = require("chai")
const { network } = require("hardhat")

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle unit tests", async function () {
      let raffle,
        vrfCoordinatorV2Mock,
        raffleEntranceFee,
        interval,
        raffleContract

      const chainId = network.config.chainId

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"])
        raffle = await ethers.getContract("Raffle", deployer)
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        )
        raffleContract = await ethers.getContract("Raffle")
        raffleEntranceFee = await raffle.getEntranceFee()
        interval = await raffle.getInterval()
      })
      describe("constructor", async function () {
        it("initializes the raffle correctly", async function () {
          //Ideally we make our tests have just 1 assert per "it"
          const raffleState = await raffle.getRaffleState()
          assert.equal(raffleState.toString(), "0")
          assert.equal(interval.toString(), networkConfig[chainId]["interval"])
        })
      })

      describe("enterRaffle", async function () {
        it("it reverts if you don't pay enough", async function () {
          await expect(raffle.enterRaffle()).to.be.revertedWith(
            "Raffle__NotEnoughETHEntered"
          )
        })
        it("records players when they enter", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee })
          const playerFromContract = await raffle.getPlayer(0)
          assert.equal(playerFromContract, deployer)
        })
        it("emits event on enter", async function () {
          await expect(
            raffle.enterRaffle({ value: raffleEntranceFee })
          ).to.emit(raffle, "RaffleEnter")
        })
        it("doesn't allow entrance when raffle is calculating", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          // we pretend to be a keeper for a second
          await raffle.performUpkeep([]) // changes the state to calculating for our comparison below
          await expect(
            raffle.enterRaffle({ value: raffleEntranceFee })
          ).to.be.revertedWith("Raffle__NotOpen")
        })
      })
      describe("checkUpkeep", async function () {
        it("returns false if people haven't sent ETH yet", async function () {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.send("evm_mine", [])
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
          assert(!upkeepNeeded)
        })
        it("returns false if raffle isn't open", async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.send("evm_mine", [])
          await raffle.performUpkeep([]) // changes the state to calculating
          const raffleState = await raffle.getRaffleState() // stores the new state
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert.equal(raffleState.toString() == "1", upkeepNeeded == false)
        })

        it("returns false if enough time hasn't passed", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 5,
          ]) // use a higher number here if this test fails
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
          assert(!upkeepNeeded)
        })
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
          assert(upkeepNeeded)
        })
      })

      describe("performUpkeep", function () {
        it("can only run if checkupkeep is true", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const tx = await raffle.performUpkeep("0x")
          assert(tx)
        })
        it("reverts if checkup is false", async () => {
          await expect(raffle.performUpkeep("0x")).to.be.revertedWith(
            "Raffle__NotUpKeepNeeded"
          )
        })
        it("updates the raffle state and emits a requestId", async () => {
          // Too many asserts in this test!
          await raffle.enterRaffle({ value: raffleEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const txResponse = await raffle.performUpkeep("0x") // emits requestId
          const txReceipt = await txResponse.wait(1) // waits 1 block
          const raffleState = await raffle.getRaffleState() // updates state
          const requestId = txReceipt.events[1].args.requestId
          assert(requestId.toNumber() > 0)
          assert(raffleState == 1) // 0 = open, 1 = calculating
        })
      })

      describe("fulfillRandomWords", function () {
        beforeEach(async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee })
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
        })
        it("can only be called after performupkeep", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address) // reverts if not fulfilled
          ).to.be.revertedWith("nonexistent request")
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address) // reverts if not fulfilled
          ).to.be.revertedWith("nonexistent request")
        })

        //This is a big test
        it("picks a winner, resets the lottery and sends money", async function () {
          const additionalEntrance = 3
          const startingAccountIndex = 1 //deployer = 0
          const accounts = await ethers.getSigners()
          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalEntrance;
            i++
          ) {
            const accountConnectedRaffle = raffle.connect(accounts[i])
            await accountConnectedRaffle.enterRaffle({
              value: raffleEntranceFee,
            })
          }
          const startingTimeStamp = await raffle.getLatestTimestamp()

          //performUpkeep (mock being chainlink keepers)
          //fullfilRandomWords

          await new Promise(async (resolve, reject) => {
            raffle.once("WinnerPicked", async () => {
              console.log("Found the event!")
              try {
                const recentWinner = await raffle.getRecentWinner()
                const raffleState = await raffle.getRaffleState()
                const winnerEndingBalance = await accounts[1].getBalance()
                const endingTimeStamp = await raffle.getLatestTimestamp()
                await expect(raffle.getPlayer(0)).to.be.reverted
                // Comparisons to check if our ending values are correct:
                assert.equal(recentWinner.toString(), accounts[1].address)
                assert.equal(raffleState, 0)

                assert.equal(endingTimeStamp > startingTimeStamp, true)

                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(
                    raffleEntranceFee
                      .mul(additionalEntrance)
                      .add(raffleEntranceFee)
                      .toString()
                  )
                )
              } catch (e) {
                reject(e)
              }
              resolve()
            })
            //Setting up the listener
            const tx = await raffle.performUpkeep([])
            const txReceipt = await tx.wait(1)
            const winnerStartingBalance = await accounts[1].getBalance()
            await await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              raffle.address
            )
          })
        })
      })
    })
