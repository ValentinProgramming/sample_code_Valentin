const utilities = {};

// This function is used to filter out jobs that we consider as "not clean" (meaning they miss one or several mandatory field)
utilities.isJobClean = (job) => {
    if (!job.title || !job.link || !job.description || !job.type || !job.location || !job.country || !job.date)
      return false;
    return true;
  }
  
// This function is used to filter out companies that we consider as "not clean" (meaning they miss one or several mandatory field)
utilities.isCompClean = (comp) => {
    if (!comp.name)
      return false;
    return true;
    }

module.exports = utilities;