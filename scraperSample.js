const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const careerbuilder = {};
const origin = "Careerbuilder";
const domainUrl = "https://www.careerbuilder.com";
const SCRAPDELAY = 1000; // Delay between each http call will be a random number between this and 2*this, if too low error 429 occurs
const utilities = require("./utilities.js");

// Extract all job links from url
careerbuilder.getJobLinks = async (keywords, scrappages, locations) => {
  let links = [];
  let page = 1;
  let USLocationsEntered = locations.USLocations; // In the looping process, locations may be replaced by an empty string as they are not taken into account for countries other than US, thus we need to keep the parameters in memory
  let USLocations = [""];
  let countries = locations.countriesLocations;
  let url = "";
  let countryDomain = "";
  for (let i = 0; i < countries.length; i++) {
    switch (countries[i]) {
      case "US":
        USLocations = USLocationsEntered;
        countryDomain = domainUrl;
        url = countryDomain + "/jobs?keywords=" + keywords + "&location=";
        break;
      case "CA":
        USLocations = [""]; // If we are not in the US, locations are omitted, we keep 1 empty element so we still enter the loop
        countryDomain = "https://www.careerbuilder.ca";
        url = countryDomain + "/jobs?keywords=" + keywords + "&location=";
        break;
      case "UK":
        USLocations = [""];
        countryDomain = "https://www.careerbuilder.co.uk";
        url = countryDomain + "/jobsearch?keywords=" + keywords + "&location=";
        break;
      case "SE":
        USLocations = [""];
        countryDomain = "https://www.careerbuilder.se";
        url = countryDomain + "/s%C3%B6k?keywords=" + keywords + "&location=";
        break;
    }

    // Goes through all pages and gets down all links (if the country is different than US the for loop will be executed only once and USLocations will be ignored)
    for (let j = 0; j < USLocations.length; j++) {
      do {
        console.log(
          "- Page " + page + " of " + (USLocations[j] || countries[i])
        );
        try {
          const pageHtml = await new Promise((resolve, reject) => {
            axios
              .get(url + USLocations[j] + "&page_number=" + page)
              .then((get) => resolve(get.data));
            setTimeout(function () {
              reject("Promise timed out after " + 10000 + " ms");
            }, 10000); // This will allow to exit the request made after 10 seconds (above this time it is likely an error occurred) so we don't remain stuck
          });
          let $ = cheerio.load(pageHtml);
          $(".data-results-content.block.job-listing-item").each((i, e) => {
            links.push(countryDomain + e.attribs.href); // This is how we get all the job links from a page
          });
        } catch (e) {
          console.log("Error on page reach, timeout or blocked or other");
        }
        page += 1;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.floor(Math.random() * (SCRAPDELAY + 1)) + SCRAPDELAY
          )
        );
      } while (page <= scrappages);
      page = 1;
    }
    if (links.length < 5) console.log("SITE BROKEN OR BLOCKED : TOO FEW LINKS");
  }
  return links;
};

// Extract data from job links
careerbuilder.getJobDetails = async (jobLink) => {
  const job = {};
  const company = {};
  try {
    const jobPageHtml = (await axios.get(jobLink)).data;
    let $ = cheerio.load(jobPageHtml);

    job.title = $(".h3.dark-blue-text").text();
    job.link = jobLink;
    if (jobLink.search("https://www.careerbuilder.com") != -1) {
      job.country = "US";
      job.source = domainUrl;
    } else if (jobLink.search("https://www.careerbuilder.ca") != -1) {
      job.country = "CA";
      job.source = "https://www.careerbuilder.ca";
    } else if (jobLink.search("https://www.careerbuilder.co.uk") != -1) {
      job.country = "UK";
      job.source = "https://www.careerbuilder.co.uk";
    } else if (jobLink.search("https://www.careerbuilder.se") != -1) {
      job.country = "SE";
      job.source = "https://www.careerbuilder.se";
    }
    let description = $(".seperate-bottom.tab.bloc.jdp-description-details")
      .html()
      .trim()
      .replace(/\n/g, " ")
      .replace(/\t/g, " ");
    let stringWithoutDescription = $(description);
    stringWithoutDescription.find('script').remove();
    let cleanDescription = stringWithoutDescription.html().trim();
    job.description = "";
    for (let i = 0; i < cleanDescription.length; i++) {
      job.description += cleanDescription[i];
    }

    job.salary = $("#cb-salcom-info .block").text().trim();
    job.location = $(".data-details").children().eq(1).text().trim();
    // Some jobs are bad and contain incorrect fields
    if (
      job.location == "Full-time" ||
      job.location == "Part-Time" ||
      job.location == "Contractor" ||
      job.location == "Full-Time/Part-Time" ||
      job.location == "Seasonal/Temp"
    )
      return null;

    let date = $('meta[name="description"]').attr("content").split("days ago"); // Retrieving date from metadata
    if (date.length > 1) {
      // Ensuring the information about the posting date is correctly given
      let currentDate = new Date();
      let pastDate =
        currentDate.getDate() - parseInt(date[0].split("Job posted")[1].trim()); // Subtracting the number of days the job was posted ago from the current date
      let postedDate = new Date();
      postedDate.setDate(pastDate);
      job.date = postedDate.getMonth() + 1 + "/" + postedDate.getDate();
    }

    job.date = new Date(job.date + "/" + new Date().getFullYear());
    job.date = new Date(
      job.date.getTime() - job.date.getTimezoneOffset() * 60000
    );
    if (job.country == "SE") {
      let script = $("script").eq(1).html(); // Enables to retrieve a script tag
      try {
        job.date = new Date(
          script.match(/(?<="posted_date":")(.*)(?=","state":")/)[0]
        );
      } catch {
        job.date = null;
      }
    }

    let tabSkill = $(".pl0.no-marker").children();
    let skills = [];
    job.skills = null;
    if (tabSkill.length > 0) {
      for (i = 0; i < tabSkill.length; i++) {
        skills.push(tabSkill[i].children[0].data)
      }
      job.skills = skills
    }
    job.type = $(".data-details")
      .children()
      .eq(2)
      .text()
      .replace(/-/g, "")
      .toLowerCase();
    if (job.type == "heltid") job.type = "fulltime";
    if (job.type == "deltid") job.type = "parttime";
    if (job.type == "heltidsanställd/deltidsanställd")
      job.type = "fulltime/parttime";

    job.company = {
      name: $(".data-details").children().eq(0).text().trim(),
      website: null,
    }
    company.name = $(".data-details").children().eq(0).text().trim();
    company.website = null;
    company.logo = $(".intl-company-logo").length > 0 ? $(".intl-company-logo")[0].attribs["data-src"] : null;
    company.size = null;

    let companyPage = $("#company-overview").attr("data-cdp");
    if (companyPage) {
      const rgxEmployee = new RegExp('employee*')
      const companyPageHtml = (await axios.get(job.source + companyPage)).data;
      $ = cheerio.load(companyPageHtml); // An additional request is made here in order to retrieve the company's website, not given on the job's page but on the company's page (which we get on the job' page)
      $(".contact-us-link").children().eq(0).text() != ''
        ? (company.website = $(".contact-us-link").children().eq(0).text(),
          job.company.website = $(".contact-us-link").children().eq(0).text())
        : (job.company.website = null, company.website = null);


      if ($(".data-details").length > 0) {
        for (let i = 1; i < $(".data-details")[0].children.length; i += 2) {
          const element = $(".data-details")[0].children[i].children[0].data;
          if (rgxEmployee.test(element)) {
            company.size = element;
          }
        }
      }
    }
    // Putting right date format

    // [HERE SHOULD BE OUR SCORING ALGORITHM, USED TO RANK JOBS & COMPANIES' RELEVANCE ACCORDING TO DEFINED CRITERIAS]

    if (!utilities.isJobClean(job) || !utilities.isCompClean(company))
      return null;
    return {
      jobs: job,
      companies: company
    };
  } catch (e) {
    console.log(e.message);
    console.log(e)
    return null;
  }
};

// Runs all functions
careerbuilder.main = async (keywords, scrappages, locations) => {
  console.log("------------------------------------------------");
  console.log(`Started scraping ${origin}`);
  // Scraping Jobs & their links
  console.log("Getting job links");
  keywords = keywords.replace(/ /g, "+");
  const jobLinks = await careerbuilder.getJobLinks(
    keywords,
    scrappages,
    locations
  );
  console.log(jobLinks.length + " job links found");
  // Creating every promises for job details scraping
  console.log("Getting job details");
  const jobPromises = [];
  for (let i = 0; i < jobLinks.length; i += 1) {
    const jobPromise = careerbuilder.getJobDetails(jobLinks[i]);
    jobPromises.push(jobPromise);
    // Random delay to avoid error 429 too many requests
    await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.floor(Math.random() * (SCRAPDELAY + 1)) + SCRAPDELAY
        )
      );
  }


  // Goes through all promises and resolves them, then saves the json
  if (jobPromises.length > 0) {
    const newJobs = await Promise.all(jobPromises)
    // [HERE IS WHERE WE ARE SUPPOSED TO RUN THE DATABASE INSERTION FUNCTION]
    // [THIS INSERTION FUNCTION IS DEFINED IN AN EXTERNAL FILE AND CHECKS DUPLICATES AS WELL AS SEVERAL OTHER PARAMETERS BEFORE INSERTING]
    return newJobs;
  } else {
    console.log("No job taken.");
    return [];
  }
};


// FROM HERE, THIS PART OF CODE IS DEFINED IN AN EXTERNAL FILE IN OUR TOOL AS WE NORMALIZED THE EXECUTION OF THE "main" METHODS FOR EACH DIFFERENT WEBSITE SCRAPED
locations = {
    // Since careerbuilder seems to be specialized in US but also provides other countries, we use both USlocations & country locations
    USLocations: [
        "New+York%2C+NY",
        "Philadelphia",
        "Jacksonville",
        "Atlanta",
        "Miami",
        "Raleigh",
      ],
    countriesLocations: ["SE", "UK"], // "US", "CA" CAN ALSO BE SCRAPED, WRITE THEM IN THE ARRAY TO SCRAPE THEM (USLocations WILL ONLY BE USED FOR US)
  };
careerbuilder.main("Marketing", 2, locations) // HERE IS THE ACTUAL SCRAPING FUNCTION
.then((scrapedData)=>{
    // BELOW CODE IS FOR DATA VISUALIZATION PURPOSE FOR THIS ADAPTED VERSION
    const jobs = []
    const companies = []
    for(let i=0; i<scrapedData.length;i++){
        if(scrapedData[i]){ // INCORRECT SCRAPED DATA SHOULD BE REMOVED IN THE ACTUAL TOOL THROUGH EXTERNAL FUNCTIONS
            jobs.push(scrapedData[i].jobs)
            companies.push(scrapedData[i].companies)
        }
    }
    console.log("Saving the json...");
    let jobsJson = JSON.stringify(jobs);
    fs.writeFile("jobs.json", jobsJson, (err) => {
    if (err) throw err;
    console.log("The jobs json has been saved");
    });
    let companiesJson = JSON.stringify(companies);
    fs.writeFile("companies.json", companiesJson, (err) => {
    if (err) throw err;
    console.log("The companies json has been saved");
  });
  console.log(`Done scraping ${origin}`);
})


module.exports = careerbuilder;
