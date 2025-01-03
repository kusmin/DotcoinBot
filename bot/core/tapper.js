const { default: axios } = require("axios");
const logger = require("../utils/logger");
const headers = require("./header");
const { Api } = require("telegram");
const settings = require("../config/config");
const app = require("../config/app");
const user_agents = require("../config/userAgents");
const fs = require("fs");
const sleep = require("../utils/sleep");
const ApiRequest = require("./api");
const { UpgradableBoostType } = require("../utils/boost");
var _ = require("lodash");
const parser = require("../utils/parser");
const path = require("path");
const _isArray = require("../utils/_isArray");
const { HttpsProxyAgent } = require("https-proxy-agent");
const FdyTmp = require("fdy-tmp");
const moment = require("moment");

class Tapper {
  constructor(tg_client) {
    this.bot_name = "dotcoin";
    this.session_name = tg_client.session_name;
    this.tg_client = tg_client.tg_client;
    this.API_URL = app.apiUrl;
    this.session_user_agents = this.#load_session_data();
    this.headers = { ...headers, "user-agent": this.#get_user_agent() };
    this.api = new ApiRequest(this.session_name, this.bot_name);
    this.sleep_floodwait = 0;
    this.runOnce = false;
    this.XXY_ZZY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqdm5tb3luY21jZXdudXlreWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDg3MDE5ODIsImV4cCI6MjAyNDI3Nzk4Mn0.oZh_ECA6fA2NlwoUamf1TqF45lrMC0uIdJXvVitDbZ8";
    this.STARTING_COIN_PRICE = 2000;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #clean_tg_web_data(queryString) {
    let cleanedString = queryString.replace(/^tgWebAppData=/, "");
    cleanedString = cleanedString.replace(
      /&tgWebAppVersion=.*?&tgWebAppPlatform=.*?(?:&tgWebAppBotInline=.*?)?$/,
      ""
    );
    return cleanedString;
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    logger.info(
      `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Generating new user agent...`
    );
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  #addSeconds(seconds) {
    let currentDate = new Date();
    let newDate = new Date(currentDate.getTime() + seconds * 1000);
    return newDate;
  }

  #compareWithCurrentTime(date) {
    let currentDate = new Date();
    if (date > currentDate) {
      return true;
    } else if (date < currentDate) {
      return false;
    } else {
      return false;
    }
  }

  #proxy_agent(proxy) {
    try {
      if (!proxy) return null;
      let proxy_url;
      if (!proxy.password && !proxy.username) {
        proxy_url = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
      } else {
        proxy_url = `${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`;
      }
      return new HttpsProxyAgent(proxy_url);
    } catch (e) {
      logger.error(
        `<ye>[${this.bot_name}]</ye> | ${
          this.session_name
        } | Proxy agent error: ${e}\nProxy: ${JSON.stringify(proxy, null, 2)}`
      );
      return null;
    }
  }

  async #get_tg_web_data() {
    try {
      const tmp = new FdyTmp({
        fileName: `${this.bot_name}.fdy.tmp`,
        tmpPath: path.join(process.cwd(), "cache/queries"),
      });
      if (tmp.hasJsonElement(this.session_name)) {
        const queryStringFromCache = tmp.getJson(this.session_name);
        if (!_.isEmpty(queryStringFromCache)) {
          const jsonData = {
            initData: queryStringFromCache,
            hash: null,
          };

          const va_hc = axios.create({
            headers: this.headers,
            withCredentials: true,
          });

          const validate = await this.api.validate_query_id(
            va_hc,
            jsonData,
            this.XXY_ZZY
          );

          if (validate) {
            logger.info(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 🔄 Getting data from cache...`
            );
            if (this.tg_client.connected) {
              await this.tg_client.disconnect();
              await this.tg_client.destroy();
            }
            await sleep(5);
            return jsonData;
          } else {
            tmp.deleteJsonElement(this.session_name);
          }
        }
      }
      await this.tg_client.connect();
      await this.tg_client.start();
      const platform = this.#get_platform(this.#get_user_agent());

      if (!this.bot) {
        this.bot = await this.tg_client.getInputEntity(app.bot);
      }

      if (!this.runOnce) {
        logger.info(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 📡 Waiting for authorization...`
        );
        const botHistory = await this.tg_client.invoke(
          new Api.messages.GetHistory({
            peer: this.bot,
            limit: 10,
          })
        );
        if (botHistory.messages.length < 1) {
          await this.tg_client.invoke(
            new Api.messages.SendMessage({
              message: "/start",
              silent: true,
              noWebpage: true,
              peer: this.bot,
            })
          );
        }
      }

      await sleep(5);

      const result = await this.tg_client.invoke(
        new Api.messages.RequestWebView({
          peer: this.bot,
          bot: this.bot,
          platform,
          from_bot_menu: true,
          url: app.webviewUrl,
        })
      );

      const authUrl = result.url;
      const tgWebData = authUrl.split("#", 2)[1];
      logger.info(
        `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 💾 Storing data in cache...`
      );

      await sleep(5);

      tmp
        .addJson(
          this.session_name,
          decodeURIComponent(this.#clean_tg_web_data(tgWebData))
        )
        .save();
      const jsonData = {
        initData: decodeURIComponent(this.#clean_tg_web_data(tgWebData)),
        hash: null,
      };

      return jsonData;
    } catch (error) {
      if (error.message.includes("AUTH_KEY_DUPLICATED")) {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | The same authorization key (session file) was used in more than one place simultaneously. You must delete your session file and create a new session`
        );
        return null;
      }
      const regex = /A wait of (\d+) seconds/;
      if (
        error.message.includes("FloodWaitError") ||
        error.message.match(regex)
      ) {
        const match = error.message.match(regex);

        if (match) {
          this.sleep_floodwait =
            new Date().getTime() / 1000 + parseInt(match[1], 10) + 10;
        } else {
          this.sleep_floodwait = new Date().getTime() / 1000 + 50;
        }
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${
            this.session_name
          } | Some flood error, waiting ${
            this.sleep_floodwait - new Date().getTime() / 1000
          } seconds to try again...`
        );
      } else {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ❗️Unknown error during Authorization: ${error}`
        );
      }
      return null;
    } finally {
      if (this.tg_client.connected) {
        await this.tg_client.disconnect();
        await this.tg_client.destroy();
      }
      this.runOnce = true;
      if (this.sleep_floodwait > new Date().getTime() / 1000) {
        await sleep(this.sleep_floodwait - new Date().getTime() / 1000);
        return await this.#get_tg_web_data();
      }
      await sleep(3);
    }
  }

  async #get_access_token(tgWebData, http_client) {
    try {
      http_client.defaults.headers["authorization"] = `Bearer ${this.XXY_ZZY}`;
      const response = await http_client.post(
        `${this.API_URL}/functions/v1/getToken`,
        JSON.stringify(tgWebData)
      );

      return response.data;
    } catch (error) {
      logger.error(
        `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ❗️Unknown error while getting Access Token: ${error}`
      );
      await sleep(3); // 3 seconds delay
    }
  }

  async #check_proxy(http_client, proxy) {
    try {
      const response = await http_client.get("https://httpbin.org/ip");
      const ip = response.data.origin;
      logger.info(
        `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Proxy IP: ${ip}`
      );
    } catch (error) {
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("getaddrinfo") ||
        error.message.includes("ECONNREFUSED")
      ) {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Error: Unable to resolve the proxy address. The proxy server at ${proxy.ip}:${proxy.port} could not be found. Please check the proxy address and your network connection.`
        );
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | No proxy will be used.`
        );
      } else {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Proxy: ${proxy.ip}:${proxy.port} | Error: ${error.message}`
        );
      }

      return false;
    }
  }

  async run(proxy) {
    let http_client;
    let access_token_created_time = 0;
    let sleep_taps = 0;

    let profile_data;

    if (settings.USE_PROXY_FROM_FILE && proxy) {
      http_client = axios.create({
        httpsAgent: this.#proxy_agent(proxy),
        headers: this.headers,
        withCredentials: true,
      });
      const proxy_result = await this.#check_proxy(http_client, proxy);
      if (!proxy_result) {
        http_client = axios.create({
          headers: this.headers,
          withCredentials: true,
        });
      }
    } else {
      http_client = axios.create({
        headers: this.headers,
        withCredentials: true,
      });
    }
    while (true) {
      try {
        const currentTime = Date.now() / 1000;
        if (currentTime - access_token_created_time >= 3600) {
          const tg_web_data = await this.#get_tg_web_data();
          if (
            _.isNull(tg_web_data) ||
            _.isUndefined(tg_web_data) ||
            !tg_web_data ||
            _.isEmpty(tg_web_data)
          ) {
            continue;
          }
          const get_token = await this.#get_access_token(
            tg_web_data,
            http_client
          );
          http_client.defaults.headers[
            "authorization"
          ] = `Bearer ${get_token?.token}`;
          http_client.defaults.headers["Apikey"] = this.XXY_ZZY;
          access_token_created_time = currentTime;
          await sleep(2);
        }
        profile_data = await this.api.get_user_data(http_client);
        if (!profile_data) {
          continue;
        }
        http_client.defaults.headers["x-telegram-user-Id"] = profile_data?.id;

        const dtc_up_price = profile_data?.dtc_level !== undefined
			? 50000 * Math.pow(2, profile_data.dtc_level)
			: null;

		if (settings.UPGRADE_INFO &&
			profile_data?.dtc_level >= 0 &&
			dtc_up_price != null &&
			profile_data?.balance >= dtc_up_price &&
			moment().diff(moment(profile_data.dtc_level_updated_at, "YYYY-MM-DD"), 'days') >= 2
			) {
			logger.info(
				`<ye>[${this.bot_name}]</ye> | ${this.session_name} | <pi>ru: Можно прокачать DTC Mining до ${profile_data.dtc_level + 1} LVL / en: It is possible to improve DTC Mining to ${profile_data.dtc_level + 1} LVL</pi>`
			);
		}
		
		if (
			settings.AUTO_UPGRADE_DTC_MINING &&
			!_.isEmpty(settings.AUDM_SES) &&
			profile_data?.dtc_level < settings.MAX_DTC_LEVEL &&
			dtc_up_price != null &&
			profile_data?.balance >= dtc_up_price &&
			profile_data?.dtc_level_updated_at &&
			moment().diff(moment(profile_data.dtc_level_updated_at, "YYYY-MM-DD"), 'days') >= 2 &&
			_.includes(settings.AUDM_SES, this.session_name)
		) {
			const upgrade_mining_response = await this.api.upgrade_dtc_mining(http_client);
			
			profile_data = await this.api.get_user_data(http_client);
            if (upgrade_mining_response?.success) {
				logger.info(
					`<ye>[${this.bot_name}]</ye> | ${this.session_name} | <gr>⬆️</gr> DTC Mining upgraded to <lb>${profile_data?.dtc_level}</lb>`
				);
            }
		}
		
		await sleep(6);
		
		if (settings.AUTO_CLAIM_TASKS) {
          const tasks_data = await this.api.get_tasks(
            http_client,
            this.#get_platform()
          );
          if (tasks_data?.length > 0) {
            for (let task of tasks_data) {
              const claimed_task = await this.api.claim_task(
                http_client,
                task.id
              );

              if (claimed_task?.success == true) {
                logger.info(
                  `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 🎉Claimed task: <la>${task.title}</la> | Reward: <lb>${task?.reward}</lb>`
                );
              }
            }
          }
        }

        //Sending Taps
        while (
		  settings.USE_TAPS &&
          profile_data?.daily_attempts > 0 &&
          !this.#compareWithCurrentTime(sleep_taps)
        ) {
          if (settings.RANDOM_TAPS_COUNT[0] > settings.RANDOM_TAPS_COUNT[1]) {
            logger.error(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ❗️Invalid Random Taps Count. RANDOM_TAPS_COUNT MIN must be less than RANDOM_TAPS_COUNT MAX. Example: RANDOM_TAPS_COUNT: [10, 20]`
            );
            process.exit(1);
          }
          if (
            settings.RANDOM_TAPS_COUNT[0] > 15000 ||
            settings.RANDOM_TAPS_COUNT[1] > 20000
          ) {
            logger.error(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ❗️Invalid Random Taps Count. RANDOM_TAPS_COUNT MAX must be less than or equal to 20000 and RANDOM_TAPS_COUNT MIN must be less than or equal to 15000. Example: RANDOM_TAPS_COUNT: [10, 20000]`
            );
            process.exit(1);
          }
          await sleep(5);
          const coins = _.random(
            settings.RANDOM_TAPS_COUNT[0],
            settings.RANDOM_TAPS_COUNT[1]
          );

          const tap_response = await this.api.send_taps(http_client, coins);

          if (tap_response?.success) {
            profile_data = await this.api.get_user_data(http_client);
            logger.success(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ✅ Taps sent successfully | (<gr>+${coins}</gr>) |⚡Remaining Energy: ${profile_data?.daily_attempts} |💰 Balance: <la>${profile_data?.balance}</la>`
            );
          } else {
            logger.error(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ❗️Failed to send taps`
            );
          }
          await sleep(5);
          profile_data = await this.api.get_user_data(http_client);
        }

        if (
          !this.#compareWithCurrentTime(sleep_taps) &&
          profile_data?.daily_attempts < 1
        ) {
          sleep_taps = this.#addSeconds(1200);
		  logger.info(
			  `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ⏳ Not enough daily attempts. Sleeping for 20 minutes | 💰 Balance: <la>${profile_data?.balance}</la>`
            );
        }

        await sleep(5);

        //Try your luck

        if (
          profile_data?.gamex2_times > 0 &&
          settings.AUTO_LUCKY_DOUBLING_COINS
        ) {
          logger.info(
            `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Trying your luck with coin doubling`
          );
          const coins =
            Math.floor(
              profile_data?.balance * profile_data?.gamex2_probability
            ) > 150000
              ? 150000
              : Math.floor(
                  profile_data?.balance * profile_data?.gamex2_probability
                );
          const try_your_luck_response = await this.api.try_your_luck(
            http_client,
            coins
          );

          profile_data = await this.api.get_user_data(http_client);

          if (try_your_luck_response?.success) {
            logger.success(
              `<ye>[${this.bot_name}]</ye> | ${
                this.session_name
              } | 🎉 You were lucky and got (<gr>+${
                coins * 2
              }</gr>) | 💰Total Balance: ${profile_data?.balance}`
            );
          } else {
            logger.info(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 😞 You weren't lucky today, we will try again tomorrow`
            );
          }
        }

        await sleep(5);

        if (
          settings.AUTO_UPGRADE_ATTEMPTS &&
          profile_data?.limit_attempts < settings.MAX_ATTEMPTS
        ) {
          const attempt_level_r = profile_data?.limit_attempts - 10;
          const attempt_level = attempt_level_r + 1;
          const attempt_level_next_level_price =
            this.STARTING_COIN_PRICE * attempt_level;
          if (profile_data?.balance >= attempt_level_next_level_price) {
            const data = {
              lvl: attempt_level,
            };
            const attempt_response = await this.api.upgrade_boost(
              http_client,
              UpgradableBoostType.ATTEMPTS,
              data
            );

            profile_data = await this.api.get_user_data(http_client);
            if (attempt_response?.success) {
              logger.info(
                `<ye>[${this.bot_name}]</ye> | ${this.session_name} | <gr>⬆️</gr> Daily attempts upgraded to <lb>${profile_data?.limit_attempts}</lb>`
              );
            }
          }
        }

        await sleep(3);

        if (
          settings.AUTO_UPGRADE_MULTITAP &&
          profile_data?.multiple_clicks < settings.MAX_MULTITAP_LEVEL
        ) {
          const multitap_level_next_level_price =
            this.STARTING_COIN_PRICE * profile_data?.multiple_clicks;
          if (profile_data?.balance >= multitap_level_next_level_price) {
            const data = {
              lvl: profile_data?.multiple_clicks,
            };
            const multitap_response = await this.api.upgrade_boost(
              http_client,
              UpgradableBoostType.MULTITAPS,
              data
            );

            profile_data = await this.api.get_user_data(http_client);
            if (multitap_response?.success) {
              logger.info(
                `<ye>[${this.bot_name}]</ye> | ${this.session_name} | <gr>⬆️</gr> Multitap upgraded to level <lb>${profile_data?.multiple_clicks}</lb>`
              );
            }
          }
        }

        await sleep(2);
        const spin_updated_atx =
          new Date(profile_data?.spin_updated_at).getTime() / 1000;
        if (
          settings.AUTO_PLAY_SPIN_TO_EARN &&
          spin_updated_atx + 28800 < Date.now() / 1000
        ) {
          const asset_data = await this.api.get_assets(http_client);
          const dtc_asset = asset_data?.find(
            (asset) => asset?.name.toLowerCase() === "dotcoin"
          );

          if (!dtc_asset || !dtc_asset?.amount) {
            continue;
          }
          let dtc_amount = dtc_asset?.amount;
          while (dtc_amount > settings.MIN_DTC_TO_STOP_SPIN_TO_EARN) {
            logger.info(
              `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Sleeping for 10 seconds before spin to earn`
            );
            await sleep(10);
            const spin_to_earn_response = await this.api.spin_to_earn(
              http_client
            );

            if (spin_to_earn_response?.success == true) {
              logger.info(
                `<ye>[${this.bot_name}]</ye> | ${this.session_name} | 🎉Won <gr>${spin_to_earn_response?.amount} ${spin_to_earn_response?.symbol}</gr> from spin to earn`
              );
            }
            const asset_data = await this.api.get_assets(http_client);
            const dtc_asset = asset_data?.find(
              (asset) => asset?.name.toLowerCase() === "dotcoin"
            );

            if (!dtc_asset || !dtc_asset?.amount) {
              break;
            }
            profile_data = await this.api.get_user_data(http_client);
            dtc_amount = dtc_asset?.amount;
          }
        }
      } catch (error) {
        logger.error(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | ❗️Unknown error: ${error}`
        );
      } finally {
        let ran_sleep;
        if (_isArray(settings.SLEEP_BETWEEN_TAP)) {
          if (
            _.isInteger(settings.SLEEP_BETWEEN_TAP[0]) &&
            _.isInteger(settings.SLEEP_BETWEEN_TAP[1])
          ) {
            ran_sleep = _.random(
              settings.SLEEP_BETWEEN_TAP[0],
              settings.SLEEP_BETWEEN_TAP[1]
            );
          } else {
            ran_sleep = _.random(450, 800);
          }
        } else if (_.isInteger(settings.SLEEP_BETWEEN_TAP)) {
          const ran_add = _.random(15, 30);
          ran_sleep = settings.SLEEP_BETWEEN_TAP + ran_add;
        } else {
          ran_sleep = _.random(450, 800);
        }

        logger.info(
          `<ye>[${this.bot_name}]</ye> | ${this.session_name} | Sleeping for ${ran_sleep} seconds...`
        );
        await sleep(ran_sleep);
      }
    }
  }
}
module.exports = Tapper;
