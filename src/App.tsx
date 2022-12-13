import * as React from "react";
import styled from "styled-components";
import WalletConnect from "@walletconnect/client";
import QRCodeModal from "@walletconnect/qrcode-modal";
import { IInternalEvent } from "@walletconnect/types";
import Button from "./components/Button";
import Column from "./components/Column";
import Wrapper from "./components/Wrapper";
import Modal from "./components/Modal";
import Header from "./components/Header";
import Loader from "./components/Loader";
import { fonts } from "./styles";
import { apiGetAccountAssets, /* apiGetGasPrices */ } from "./helpers/api";
import {
  sanitizeHex,
  verifySignature,
  hashTypedDataMessage
} from "./helpers/utilities";
// import * as stablecoinJSON from "./helpers/UChildERC20.json"
import { /* convertAmountToRawNumber */ convertStringToHex } from "./helpers/bignumber";
import { IAssetData } from "./helpers/types";
import Banner from "./components/Banner";
import AccountAssets from "./components/AccountAssets";
import Web3 from "web3";

const maticProvider = "https://polygon-mainnet.g.alchemy.com/v2/NQJX5-zWuTgEHKLfvBAo_kYmov-ftlvT";
const web3 = new Web3(maticProvider);

const SLayout = styled.div`
  position: relative;
  width: 100%;
  /* height: 100%; */
  min-height: 100vh;
  text-align: center;
`;

const SContent = styled(Wrapper as any)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`;

const SLanding = styled(Column as any)`
  height: 600px;
`;

const SButtonContainer = styled(Column as any)`
  width: 250px;
  margin: 50px 0;
`;

const SConnectButton = styled(Button as any)`
  border-radius: 8px;
  font-size: ${fonts.size.medium};
  height: 44px;
  width: 100%;
  margin: 12px 0;
`;

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`;

const SModalContainer = styled.div`
  width: 100%;
  position: relative;
  word-wrap: break-word;
`;

const SModalTitle = styled.div`
  margin: 1em 0;
  font-size: 20px;
  font-weight: 700;
`;

const SModalParagraph = styled.p`
  margin-top: 30px;
`;

// @ts-ignore
const SBalances = styled(SLanding as any)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

const STable = styled(SContainer as any)`
  flex-direction: column;
  text-align: left;
`;

const SRow = styled.div`
  width: 100%;
  display: flex;
  margin: 6px 0;
`;

const SKey = styled.div`
  width: 30%;
  font-weight: 700;
`;

const SValue = styled.div`
  width: 70%;
  font-family: monospace;
`;

const STestButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
`;

const STestButton = styled(Button as any)`
  border-radius: 8px;
  font-size: ${fonts.size.medium};
  height: 44px;
  width: 100%;
  max-width: 175px;
  margin: 12px;
`;

interface IAppState {
  connector: WalletConnect | null;
  fetching: boolean;
  connected: boolean;
  chainId: number;
  showModal: boolean;
  pendingRequest: boolean;
  uri: string;
  accounts: string[];
  address: string;
  result: any | null;
  assets: IAssetData[];
  stablecoinAddress: string,
  to: string,
  amount: string,
  functionSig: string
}

const INITIAL_STATE: IAppState = {
  connector: null,
  fetching: false,
  connected: false,
  chainId: 1,
  showModal: false,
  pendingRequest: false,
  uri: "",
  accounts: [],
  address: "",
  result: null,
  assets: [],
  stablecoinAddress: "0x5540d42547eadf69d2CD0C0398892Ee1E53476B7",
  to: "0xD5cfcC5B4ba1900Ba52522705bFBB5D4E82120D9",
  amount: "1000000",
  functionSig:""
};

class App extends React.Component<any, any> {
  public state: IAppState = {
    ...INITIAL_STATE,
  };

  public connect = async () => {
    // bridge url
    const bridge = "https://bridge.walletconnect.org";

    // create new connector
    const connector = new WalletConnect({ bridge, qrcodeModal: QRCodeModal });
    console.log(connector);
    await this.setState({ connector });

    // check if already connected
    if (!connector.connected) {
      // create new session
      await connector.createSession();
    }

    // subscribe to events
    await this.subscribeToEvents();
  };
  public subscribeToEvents = () => {
    const { connector } = this.state;

    if (!connector) {
      return;
    }

    connector.on("session_update", async (error, payload) => {
      console.log(`connector.on("session_update")`);

      if (error) {
        throw error;
      }

      const { chainId, accounts } = payload.params[0];
      this.onSessionUpdate(accounts, chainId);
    });

    connector.on("connect", (error, payload) => {
      console.log(`connector.on("connect")`);

      if (error) {
        throw error;
      }

      this.onConnect(payload);
    });

    connector.on("disconnect", (error, payload) => {
      console.log(`connector.on("disconnect")`);

      if (error) {
        throw error;
      }

      this.onDisconnect();
    });

    if (connector.connected) {
      const { chainId, accounts } = connector;
      const address = accounts[0];
      this.setState({
        connected: true,
        chainId,
        accounts,
        address,
      });
      this.onSessionUpdate(accounts, chainId);
    }

    this.setState({ connector });
  };

  public killSession = async () => {
    const { connector } = this.state;
    if (connector) {
      connector.killSession();
    }
    this.resetApp();
  };

  public resetApp = async () => {
    await this.setState({ ...INITIAL_STATE });
  };

  public onConnect = async (payload: IInternalEvent) => {
    const { chainId, accounts } = payload.params[0];
    const address = accounts[0];
    await this.setState({
      connected: true,
      chainId,
      accounts,
      address,
    });
    this.getAccountAssets();
  };

  public onDisconnect = async () => {
    this.resetApp();
  };

  public onSessionUpdate = async (accounts: string[], chainId: number) => {
    const address = accounts[0];
    await this.setState({ chainId, accounts, address });
    await this.getAccountAssets();
  };

  public getAccountAssets = async () => {
    const { address, chainId } = this.state;
    this.setState({ fetching: true });
    try {
      // get account balances
      const assets = await apiGetAccountAssets(address, chainId);

      await this.setState({ fetching: false, address, assets });
    } catch (error) {
      console.error(error);
      await this.setState({ fetching: false });
    }
  };

  public toggleModal = () => this.setState({ showModal: !this.state.showModal });

  public testSendTransaction = async () => {
    const { connector, address, chainId } = this.state;

    if (!connector) {
      return;
    }

    // from -> our friendly gas spender
    const from = "0x683D8F79C6198374E8EBe7AF088d281E5fb2Fd6e";

    // *****************************************************************
    // TODO add pk
    const privateKey: string = "PRIVATE_KEY"

    // nonce
    const nonce = await web3.eth.getTransactionCount(from);

    // gasPrice
    const gasPrice = await web3.eth.getGasPrice()

    // gasLimit
    const _gasLimit = 100000; // 100.000
    const gasLimit = sanitizeHex(convertStringToHex(_gasLimit));

    /* web3.eth.personal.importRawKey(privateKey, "pass")
    web3.eth.personal.unlockAccount(address, "pass", 600)

    const stablecoin = new web3.eth.Contract(stablecoinJSON.["abi"], this.state.stablecoinAddress) */

    console.log("creating data")

    // data
    const data = await web3.eth.abi.encodeFunctionCall({
      name: 'executeMetaTransaction', 
      type: 'function', 
      inputs: [{
          name: "userAddress",
          type: "address"
        }, {
          name: "functionSignature",
          type: "bytes"
        }, {
          name: "sigR",
          type: "bytes32"
        }, {
          name: "sigS",
          type: "bytes32"
        }, {
          name: "sigV",
          type: "uint8"
        }]
    }, [address, this.state.functionSig, this.state.result.r, this.state.result.s, this.state.result.V]);

    console.log(data)

    // test transaction
    const tx = {
      from,
      nonce,
      gasLimit,
      gasPrice,
      to: this.state.stablecoinAddress,
      value: 0,
      data,
      chainId
    };

    try {
      // open modal
      this.toggleModal();

      // toggle pending request indicator
      this.setState({ pendingRequest: true });

      // send transaction
      // const result = await connector.sendTransaction(rawTx);

      
      // sign tx
      console.log("sign tx")
      console.log("private key: ", privateKey)
      const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
      console.log("signed tx: ", signedTx)
      const rawTransaction = signedTx.rawTransaction ? signedTx.rawTransaction : ""

      console.log(rawTransaction)

      // send tx
      web3.eth.sendSignedTransaction(rawTransaction).on("receipt", () => { alert("transaction submitted") })

      /* const receipt = await web3.eth.getTransactionReceipt(signedTx.transactionHash ? signedTx.transactionHash : "")
      console.log("Receipt: ", receipt) */


      /* const result = await stablecoin.methods.executeMetaTransaction(address, this.state.functionSig, this.state.result.r, this.state.result.s, this.state.result.V).send({
        from,
        nonce,
        gasPrice,
        gasLimit,
        chainId
      }) */

      // format displayed result
      const formattedResult = {
        method: "eth_sendTransaction",
        txHash: signedTx.transactionHash,
        from,
        to: this.state.stablecoinAddress
      };

      // display result
      this.setState({
        connector,
        pendingRequest: false,
        result: formattedResult || null,
      });
    } catch (error) {
      console.error(error);
      this.setState({ connector, pendingRequest: false, result: null });
    }
  };

  public testSignTypedData = async () => {
    const { connector, address, chainId } = this.state;
    console.log("Connector", connector)
    if (!connector) {
      return;
    }

    const salt = await web3.utils.padLeft(web3.utils.numberToHex(chainId), 64)
		const data = await web3.eth.abi.encodeFunctionCall({
      name: 'nonces', 
      type: 'function', 
      inputs: [{
          name: "owner",
          type: "address"
        }]
    }, [address]);
    const nonce = await web3.eth.call ({
      to: this.state.stablecoinAddress,
      data
    });

    const functionSig = await this.createTransferTransactionSignature(this.state.to, this.state.amount);

    const dataToSign = this.createTypedData(salt, nonce, address, functionSig);

    const message = JSON.stringify(dataToSign);

    // eth_signTypedData params
    const msgParams = [address, message];

    try {
      // open modal
      this.toggleModal();

      // toggle pending request indicator
      this.setState({ pendingRequest: true });

      // Draft Custom Request
      const customRequest = {
        id: 1,
        jsonrpc: "2.0",
        method: "eth_signTypedData_v4",
        params: msgParams,
      };

      // Send Custom Request
      const result = await connector.sendCustomRequest(customRequest)

      // sign typed data
      // const result = await connector.signTypedData(msgParams);

      // verify signature
      const hash = hashTypedDataMessage(message);
      const valid = await verifySignature(address, result, hash, chainId);


      // get signature parameters
      if (!web3.utils.isHexStrict(result)) {
        throw new Error('Given value "'.concat(result, '" is not a valid hex string.'))
      }
      const r = result.slice(0, 66)
      const s = "0x".concat(result.slice(66, 130))
      const v = "0x".concat(result.slice(130, 132))
      let V = web3.utils.hexToNumber(v)
      if (![27, 28].includes(V)) {
        V += 27
      }

      // format displayed result
      const formattedResult = {
        method: "eth_signTypedData_v4",
        address,
        valid,
        r,
        s,
        V
      };

      // display result
      this.setState({
        connector,
        pendingRequest: false,
        result: formattedResult || null,
      });
    } catch (error) {
      console.error(error);
      this.setState({ connector, pendingRequest: false, result: null });
    }
  };

  public createTypedData = (salt: string, nonce: string, from: string, functionSig: number[]) => {
    return {
      types: {
        EIP712Domain: [
          {
            name: "name",
            type: "string",
          },
          {
            name: "version",
            type: "string",
          },
          {
            name: "verifyingContract",
            type: "address",
          },
          {
            name: "salt",
            type: "bytes32",
          },
        ],
        MetaTransaction: [
          {
            name: "nonce",
            type: "uint256",
          },
          {
            name: "from",
            type: "address",
          },
          {
            name: "functionSignature",
            type: "bytes",
          },
        ],
      },
      domain: {
        name: "Test Stablecoin",
        version: "1",
        verifyingContract: this.state.stablecoinAddress,
        salt,
      },
      primaryType: "MetaTransaction",
      message: {
        nonce,
        from,
        functionSignature: functionSig,
      },
    }
  };

  public createTransferTransactionSignature = async (to: string, amount: string) => {
		const functionSig = await web3.eth.abi.encodeFunctionCall(
			{
				name: "transfer",
				type: "function",
				inputs: [
					{
						name: "recipient",
						type: "address",
					},
					{
						name: "amount",
						type: "uint256",
					},
				],
      },
      // should amount be number?
			[to, amount]
    )
    
    this.setState({ functionSig });

		// convert it to bytes
    return await web3.utils.hexToBytes(functionSig);
  }

  public handleChangeAmount = async (e: any) => {
      this.setState({amount: e.target.value });
  }

  public handleChangeTo = async (e: any) => {
    this.setState({to: e.target.value });
  }

  public render = () => {
    const {
      assets,
      address,
      connected,
      chainId,
      fetching,
      showModal,
      pendingRequest,
      result,
    } = this.state;
    return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={address}
            chainId={chainId}
            killSession={this.killSession}
          />
          <SContent>
            {!address && !assets.length ? (
              <SLanding center>
                <h3>
                  {`Please connect your wallet!`}
                </h3>
                <SButtonContainer>
                  <SConnectButton left onClick={this.connect} fetching={fetching}>
                    {"Connect"}
                  </SConnectButton>
                </SButtonContainer>
              </SLanding>
            ) : (
              <SBalances>
                  <Banner />
                  
                    <a href="https://polygonscan.com/token/0x5540d42547eadf69d2cd0c0398892ee1e53476b7" target="_blank" rel="noopener noreferrer">Link: Test Token on Polygon</a>
                  
                <h3>Actions</h3>
                  <Column center>
                    <input
                      type="text"
                      value={this.state.to}
                      onChange={this.handleChangeTo}
                    />
                    <p>To: {this.state.to}</p> 
                    <input
                      type="text"
                      value={this.state.amount}
                      onChange={this.handleChangeAmount}
                    />
                    <p>Amount: {this.state.amount} / 6</p> 
                  </Column>
                <Column center>
                  <STestButtonContainer>
                    <STestButton left onClick={this.testSignTypedData}>
                      {"eth_signTypedData"}
                    </STestButton>
                    <STestButton disabled={this.state.result == null} left onClick={this.testSendTransaction}>
                      {"send Transaction"}
                    </STestButton>
                  </STestButtonContainer>
                </Column>
                <h3>Balances</h3>
                {!fetching ? (
                  <AccountAssets chainId={chainId} assets={assets} />
                ) : (
                  <Column center>
                    <SContainer>
                      <Loader />
                    </SContainer>
                  </Column>
                )}
              </SBalances>
            )}
          </SContent>
          <SContent>
            {result ? (
              <SModalContainer>
                <SModalTitle>{"Call Request Approved"}</SModalTitle>
                <STable>
                  {Object.keys(result).map(key => (
                    <SRow key={key}>
                      <SKey>{key}</SKey>
                      <SValue>{result[key].toString()}</SValue>
                    </SRow>
                  ))}
                  <SRow>
                      <SKey>{"functionSig"}</SKey>
                      <SValue>{this.state.functionSig.toString()}</SValue>
                    </SRow>
                </STable>
              </SModalContainer>
            ): null }
          </SContent>
        </Column>
        
        <Modal show={showModal} toggleModal={this.toggleModal}>
          {pendingRequest ? (
            <SModalContainer>
              <SModalTitle>{"Pending Request"}</SModalTitle>
              <SContainer>
                <Loader />
                <SModalParagraph>{"check your wallet"}</SModalParagraph>
              </SContainer>
            </SModalContainer>
          ) : result ? (
            <SModalContainer>
              <SModalTitle>{"Call Request Approved"}</SModalTitle>
              <STable>
                {Object.keys(result).map(key => (
                  <SRow key={key}>
                    <SKey>{key}</SKey>
                    <SValue>{result[key].toString()}</SValue>
                  </SRow>
                ))}
              </STable>
            </SModalContainer>
          ) : (
            <SModalContainer>
              <SModalTitle>{"Call Request Rejected"}</SModalTitle>
            </SModalContainer>
          )}
        </Modal>
      </SLayout>
    );
  };
}

export default App;
