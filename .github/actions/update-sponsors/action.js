const core = require('@actions/core');
const fs = require('fs');
const axios = require('axios');
const puppeteer = require('puppeteer');

const local = false;
const localKey = '';
const root = local ? '' : '/home/runner/work/papermc.io/papermc.io/work/';

main();

async function main() {
    const [ocData, ghData] = await Promise.all([opencollective(), github()].map(p => p.catch(e => e)));

    let listEntries = "";
    let count = 0;

    let ocCount;
    if (ocData instanceof Error) {
        console.log("OC Error!", ocData);
        ocCount = -1;
    } else {
        ocData.collective.contributors.nodes = ocData.collective.contributors.nodes
            .filter(node => node.name !== "GitHub Sponsors");
        ocData.collective.contributors.nodes.sort((a, b) => b.totalAmountDonated - a.totalAmountDonated);
        ocData.collective.contributors.nodes.forEach(node => {
            listEntries += createListEntry(node.name, node.image);
            count++;
        });
        ocCount = ocData.collective.contributors.totalCount;
    }

    let ghCount;
    if (ghData instanceof Error) {
        console.log("GH Error!", ghData);
        ghCount = -1;
    } else {
        ghData.organization.sponsors.nodes = ghData.organization.sponsors.nodes
            .filter(node => !ocData.collective.contributors.nodes.some(e => e.name === node.login));
        // TODO figure out how to sort gh sponsors by total amount donated. The api is stupid.
        ghData.organization.sponsors.nodes.forEach(node => {
            listEntries += createListEntry(node.login, node.avatarUrl.replace("&v=4", ""));
            count++;
        });
        ghCount = ghData.organization.sponsors.totalCount;
    }

    console.log(`Found ${ocCount} OC Sponsors and ${ghCount} GH Sponsors`);
    fs.writeFileSync(root + 'sponsors.json', JSON.stringify({ocData, ghData}));

    const height = Math.ceil(count / 6.0) * 80;
    const width = 500;
    const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
    const page = await browser.newPage();
    const html = `<html lang="en" style="height: ${height}px;width: ${width}px">
    <body>
    <ul style="margin: 0;padding: 0;list-style: none;">
        ${listEntries}
    </ul>
    </body>
    </html>
    `;
    fs.writeFileSync(root + 'sponsors.html', html);
    await page.setContent(html);
    await page.screenshot({path: root + 'sponsors.png', omitBackground: true, clip: {x: 0, y: 0, height, width}});
    await browser.close();

    console.log('Saved');
}

function createListEntry(name, image) {
    return `<li style="display: inline"><img src='${image}' alt='${name}' title='${name}' onerror='this.src="https://opencollective.com/static/images/default-guest-logo.svg"' style="height: 64px;width: 64px;margin: 5px;border-radius: 15px;box-shadow: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23);"/></li>`;
}

async function opencollective() {
    // language=GraphQL
    const query = `{
        collective(slug: "papermc") {
            name
            slug
            stats {
                balance {
                    valueInCents
                }
                monthlySpending {
                    valueInCents
                }
            }
            contributors(roles: BACKER, limit: 100) {
                totalCount
                nodes {
                    name
                    image
                    totalAmountDonated
                }
            }
        }
    }`;
    const result = await graphQL('https://api.opencollective.com/graphql/v2', query);
    return result.data;
}

async function github() {
    // language=GraphQL
    const query = `{
        organization(login: "papermc") {
            sponsors(first: 100) {
                totalCount
                nodes {
                    ... on Actor {
                        login
                        avatarUrl
                    }
                }
            }
        }
    }`;
    const apiKey = core.getInput("repo-token", {required: !local});
    const result = await graphQL('https://api.github.com/graphql', query, 'Bearer ' + (local ? localKey : apiKey));
    return result.data;
}

async function graphQL(url, query, auth) {
    const result = await axios.post(url, {query}, {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': auth ? auth : ''
        }
    }).catch(e => console.log(`query to ${url} failed: ${e.response.status}, ${e.response ? JSON.stringify(e.response.data) : null}`,));
    return result.data;
}
